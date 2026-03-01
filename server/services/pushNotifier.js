const webpush = require('web-push');
const pool = require('../config/db');

// VAPID keys from environment
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@bitewise.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

async function sendNotification(userId, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  try {
    const subs = await pool.query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    for (const sub of subs.rows) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired, remove it
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        }
      }
    }
  } catch (err) {
    console.error('Push notification error:', err);
  }
}

module.exports = { sendNotification };
