require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Build identifier: read what `vite build` wrote into dist/build-id.txt.
// Stamped on every response as X-App-Version so old clients can detect
// they're running outdated code and self-refresh.
const BUILD_ID = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'client', 'dist', 'build-id.txt'), 'utf8').trim();
  } catch {
    return `dev-${Date.now()}`;
  }
})();

const authRoutes = require('./routes/auth');
const mealsRoutes = require('./routes/meals');
const goalsRoutes = require('./routes/goals');
const preferencesRoutes = require('./routes/preferences');
const sharingRoutes = require('./routes/sharing');
const foodsRoutes = require('./routes/foods');
const chatRoutes = require('./routes/chat');
const customMealsRoutes = require('./routes/custom-meals');
const plannedMealsRoutes = require('./routes/planned-meals');
const weightRoutes = require('./routes/weight');
const reportsRoutes = require('./routes/reports');
const barcodeRoutes = require('./routes/barcode');
const photoRoutes = require('./routes/photo');
const challengesRoutes = require('./routes/challenges');
const suggestionsRoutes = require('./routes/suggestions');
const notificationsRoutes = require('./routes/notifications');
const avatarsRoutes = require('./routes/avatars');
const voiceLogRoutes = require('./routes/voice-log');
const chatHistoryRoutes = require('./routes/chat-history');
const tasksRoutes = require('./routes/tasks');
const userSettingsRoutes = require('./routes/user-settings');
const { startMealReminders } = require('./services/mealReminder');
const { startTaskReminders } = require('./services/taskReminder');

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Cloud Foundry / reverse proxies, trust the first hop so req.ip and
// X-Forwarded-For reflect the real client (used by rate limiting).
app.set('trust proxy', 1);

app.use(cors({ exposedHeaders: ['X-App-Version'] }));
app.use(express.json({ limit: '5mb' }));

// Stamp the build version on every response so any client (axios, fetch,
// service worker) can compare it against its baked-in __BUILD_ID__ and
// trigger a hard refresh if they don't match.
app.use((req, res, next) => {
  res.setHeader('X-App-Version', BUILD_ID);
  next();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/meals', mealsRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/sharing', sharingRoutes);
app.use('/api/foods', foodsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/custom-meals', customMealsRoutes);
app.use('/api/planned-meals', plannedMealsRoutes);
app.use('/api/weight', weightRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/photo', photoRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/suggestions', suggestionsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/avatars', avatarsRoutes);
app.use('/api/voice-log', voiceLogRoutes);
app.use('/api/chat-history', chatHistoryRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/user-settings', userSettingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Returns the current build id so the client can compare directly.
app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({ version: BUILD_ID });
});

// Cache-buster: a tiny no-cache HTML page that unregisters every service
// worker, deletes every cache, then redirects to /. Lives under /api/* so
// it cannot be intercepted by an existing (stale) service worker. Anyone
// stuck on an old build can visit this URL on any device to fully reset.
app.get('/api/refresh', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Updating Bitewise…</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;
       background:#f6f7fb;color:#0f172a}
  .box{text-align:center;padding:1.5rem;max-width:340px}
  h1{font-size:1.3rem;font-weight:700;margin:0 0 0.6rem}
  p{color:#64748b;font-size:0.9rem;line-height:1.4;margin:0 0 1rem}
  .spinner{width:38px;height:38px;border-radius:50%;border:3px solid #e6e8ee;
           border-top-color:#2563eb;animation:s 0.8s linear infinite;margin:0 auto 1rem}
  @keyframes s{to{transform:rotate(360deg)}}
  a{color:#2563eb;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<div class="box">
  <div class="spinner" aria-hidden="true"></div>
  <h1>Updating Bitewise…</h1>
  <p>Clearing local cache and loading the latest version.</p>
  <p><a id="manual" href="/?_=${Date.now()}">Tap here if it doesn't redirect</a></p>
</div>
<script>
(async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {}
  // Reload to / with a cache-buster so even HTTP caches can't serve stale.
  location.replace('/?_=' + Date.now());
})();
</script>
</body>
</html>`);
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'client', 'dist');

  // Static middleware skips index.html so the SPA catch-all below can attach
  // no-cache headers to it. Hashed assets get long-lived immutable caching.
  app.use(express.static(distDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Service-Worker-Allowed', '/');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    },
  }));

  app.get('*', (req, res) => {
    // index.html must NEVER be cached — it references hashed asset filenames
    // that change every deploy. Caching here is what made app updates fail
    // to roll out across devices.
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startMealReminders();
  startTaskReminders();
});
