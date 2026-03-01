const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Get VAPID public key
router.get('/vapid-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

// Subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys, tz_offset } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET keys_p256dh = $3, keys_auth = $4`,
      [req.userId, endpoint, keys.p256dh, keys.auth]
    );
    if (tz_offset != null) {
      await pool.query(
        `INSERT INTO user_timezones (user_id, tz_offset) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET tz_offset = $2`,
        [req.userId, tz_offset]
      );
    }
    res.json({ message: 'Subscribed' });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.userId, endpoint]
    );
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get notification preferences
router.get('/preferences', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT notify_reminders, notify_sharing FROM calorie_goals WHERE user_id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.json({ notify_reminders: true, notify_sharing: true });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get notification prefs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update notification preferences
router.put('/preferences', async (req, res) => {
  try {
    const { notify_reminders, notify_sharing } = req.body;
    await pool.query(
      `UPDATE calorie_goals SET notify_reminders = COALESCE($2, notify_reminders), notify_sharing = COALESCE($3, notify_sharing) WHERE user_id = $1`,
      [req.userId, notify_reminders, notify_sharing]
    );
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('Update notification prefs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
