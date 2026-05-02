import api from './client';

// localStorage caches a Set of URLs the user has already seen verified.
// Negatives are NOT cached — a transient AI failure shouldn't permanently
// hide a legitimate food image.
const KEY = 'food-img-safe-v1';

function readCache() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function writeCache(set) {
  try {
    // Cap at ~1000 entries to keep localStorage small
    const arr = [...set].slice(-1000);
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

export function isCachedSafe(url) {
  if (!url) return false;
  return readCache().has(url);
}

// Batched lookup: many concurrent calls within 80ms collapse into one
// /api/photo/check-safe request. Returns a promise resolving to true if
// the URL is verified safe.
let pendingUrls = new Set();
let pendingResolvers = new Map(); // url -> Array<(boolean) => void>
let flushTimer = null;

async function flush() {
  flushTimer = null;
  const urls = [...pendingUrls];
  const resolvers = pendingResolvers;
  pendingUrls = new Set();
  pendingResolvers = new Map();
  if (urls.length === 0) return;

  let verdicts = {};
  try {
    const res = await api.post('/photo/check-safe', { urls });
    verdicts = res.data?.verdicts || {};
  } catch {
    // On API failure, treat all as unsafe (don't show)
  }

  const cache = readCache();
  let mutated = false;
  for (const url of urls) {
    const safe = !!verdicts[url];
    if (safe && !cache.has(url)) { cache.add(url); mutated = true; }
    const list = resolvers.get(url) || [];
    for (const r of list) r(safe);
  }
  if (mutated) writeCache(cache);
}

export function verifyImageSafe(url) {
  if (!url) return Promise.resolve(false);
  const cache = readCache();
  if (cache.has(url)) return Promise.resolve(true);
  return new Promise((resolve) => {
    pendingUrls.add(url);
    if (!pendingResolvers.has(url)) pendingResolvers.set(url, []);
    pendingResolvers.get(url).push(resolve);
    if (!flushTimer) flushTimer = setTimeout(flush, 80);
  });
}
