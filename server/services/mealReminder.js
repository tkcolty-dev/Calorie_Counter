const pool = require('../config/db');
const { sendNotification } = require('./pushNotifier');

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const MEAL_REMINDERS = [
  { hour: 8, title: 'Breakfast Reminder', body: "Time for breakfast! Log what you're having." },
  { hour: 12, title: 'Lunch Reminder', body: "Lunchtime! Don't forget to log your meal." },
  { hour: 18, title: 'Dinner Reminder', body: "Dinner time! What are you having tonight?" },
];

// Track last reminder sent per user to avoid duplicates within the same meal window
const lastSent = new Map(); // userId -> lastReminderHour

async function checkAndSendReminders() {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT cg.user_id, ut.tz_offset
      FROM calorie_goals cg
      JOIN push_subscriptions ps ON ps.user_id = cg.user_id
      JOIN user_timezones ut ON ut.user_id = cg.user_id
      WHERE cg.notify_reminders = true
    `);

    const utcNow = new Date();

    for (const { user_id, tz_offset } of rows) {
      const localHour = (utcNow.getUTCHours() + tz_offset / 60 + 24) % 24;

      for (const reminder of MEAL_REMINDERS) {
        // Send if local hour is within the 15-min window of the target hour
        if (localHour >= reminder.hour && localHour < reminder.hour + 0.25) {
          const key = `${user_id}`;
          if (lastSent.get(key) === reminder.hour) continue;

          console.log(`Meal reminder: sending "${reminder.title}" to user ${user_id}`);
          await sendNotification(user_id, {
            title: reminder.title,
            body: reminder.body,
            url: '/log',
          });
          lastSent.set(key, reminder.hour);
        }
      }
    }
  } catch (err) {
    console.error('Meal reminder check error:', err);
  }
}

function startMealReminders() {
  console.log('Meal reminder scheduler started (every 15 min)');
  setInterval(checkAndSendReminders, INTERVAL_MS);
  // Run once on startup after a short delay
  setTimeout(checkAndSendReminders, 5000);
}

module.exports = { startMealReminders };
