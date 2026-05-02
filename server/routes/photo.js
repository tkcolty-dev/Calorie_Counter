const express = require('express');
const auth = require('../middleware/auth');
const { analyzePhoto, checkImageIsFood } = require('../services/claude');

const router = express.Router();
router.use(auth);

router.post('/analyze', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'image (base64) is required' });
    }
    // Strip data URL prefix if present
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const items = await analyzePhoto(base64);
    res.json({ items });
  } catch (err) {
    console.error('Photo analyze error:', err);
    res.status(500).json({ error: 'Photo analysis failed' });
  }
});

// In-process verdict cache. Survives until the app restarts. The same URL
// won't be re-checked twice.
const safeCache = new Map();      // url -> boolean
const inflight = new Map();       // url -> Promise<boolean>
const MAX_CACHE = 5000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const FETCH_TIMEOUT_MS = 5000;

function isAllowedHost(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    // Only allow Open Food Facts image hosts. Add more if needed.
    return /(^|\.)openfoodfacts\.org$/i.test(u.hostname);
  } catch {
    return false;
  }
}

async function fetchImageBuffer(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function verifyOne(url) {
  if (!isAllowedHost(url)) return false;
  if (safeCache.has(url)) return safeCache.get(url);
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    try {
      const buf = await fetchImageBuffer(url);
      if (!buf) return false;
      const verdict = await checkImageIsFood(buf.toString('base64'));
      return !!verdict;
    } catch {
      return false;
    }
  })();
  inflight.set(url, p);
  let verdict = false;
  try {
    verdict = await p;
  } finally {
    inflight.delete(url);
    if (safeCache.size > MAX_CACHE) safeCache.clear();
    safeCache.set(url, verdict);
  }
  return verdict;
}

router.post('/check-safe', async (req, res) => {
  try {
    let { urls } = req.body || {};
    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls (array) is required' });
    }
    // De-dupe and cap so a malicious caller can't flood us.
    urls = [...new Set(urls.filter(u => typeof u === 'string'))].slice(0, 20);

    const verdicts = {};
    await Promise.all(urls.map(async (url) => {
      verdicts[url] = await verifyOne(url);
    }));
    res.json({ verdicts });
  } catch (err) {
    console.error('Image safety check error:', err);
    res.status(500).json({ error: 'Image safety check failed' });
  }
});

module.exports = router;
