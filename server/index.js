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
const { startMealReminders } = require('./services/mealReminder');

const app = express();
const PORT = process.env.PORT || 3001;

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startMealReminders();
});
