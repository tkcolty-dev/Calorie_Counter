require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

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
const { startMealReminders } = require('./services/mealReminder');
const { startTaskReminders } = require('./services/taskReminder');

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Cloud Foundry / reverse proxies, trust the first hop so req.ip and
// X-Forwarded-For reflect the real client (used by rate limiting).
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
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
