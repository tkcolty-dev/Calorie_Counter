// Lightweight in-memory rate limiter. No external deps.
// Tracks attempts per (key + IP). Sweeps expired buckets periodically.
//
// Use cases:
//   - login:    block credential-stuffing / brute force
//   - register: block account creation spam
//
// Notes:
//   - In-memory only — fine for single-instance deploys (current Cloud Foundry
//     manifest runs one instance). If we scale horizontally, swap this for Redis.

const buckets = new Map();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function clientIp(req) {
  // Trust the first XFF entry only when running behind a known proxy.
  // Cloud Foundry sets X-Forwarded-For; for local dev fall back to socket address.
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function rateLimit({ windowMs, max, key, message, skipSuccessful }) {
  if (!key || typeof key !== 'string') throw new Error('rateLimit: key required');
  return (req, res, next) => {
    const ip = clientIp(req);
    const k = `${key}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(k);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(k, bucket);
    }
    if (bucket.count >= max) {
      const retryAfter = Math.ceil((bucket.start + windowMs - now) / 1000);
      res.set('Retry-After', String(Math.max(retryAfter, 1)));
      return res.status(429).json({
        error: message || 'Too many attempts. Please try again later.',
        retryAfterSeconds: retryAfter,
      });
    }
    bucket.count += 1;

    if (skipSuccessful) {
      // If the request succeeds, refund the attempt so legitimate users don't lock themselves out.
      const origJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode < 400) bucket.count = Math.max(0, bucket.count - 1);
        return origJson(body);
      };
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    // Drop buckets older than 1 hour, regardless of window.
    if (now - b.start > 60 * 60 * 1000) buckets.delete(k);
  }
}, SWEEP_INTERVAL_MS).unref?.();

module.exports = { rateLimit };
