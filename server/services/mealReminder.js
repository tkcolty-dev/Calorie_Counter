const pool = require('../config/db');
const { sendNotification } = require('./pushNotifier');

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const MEAL_REMINDERS = [
  { hour: 8,  meal_type: 'breakfast', title: 'Breakfast time', body: 'Tap to log your breakfast in one tap.' },
  { hour: 12, meal_type: 'lunch',     title: 'Lunch time',     body: 'Tap to log your usual lunch.' },
  { hour: 18, meal_type: 'dinner',    title: 'Dinner time',    body: 'Tap to log dinner — your usual or something new.' },
];

// Track last reminder sent per user-day-meal so we don't double-send
const lastSent = new Map();

async function alreadyLoggedToday(userId, mealType, tzOffsetMin) {
  // User's local "today" given their timezone offset
  const utcNow = new Date();
  const localMs = utcNow.getTime() + tzOffsetMin * 60 * 1000;
  const local = new Date(localMs);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const todayLocal = `${yyyy}-${mm}-${dd}`;
  const r = await pool.query(
    `SELECT 1 FROM meals WHERE user_id = $1 AND meal_type = $2 AND logged_at::date = $3 LIMIT 1`,
    [userId, mealType, todayLocal]
  );
  return r.rows.length > 0;
}

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
    const dayKey = utcNow.toISOString().slice(0, 10);

    for (const { user_id, tz_offset } of rows) {
      const localHour = (utcNow.getUTCHours() + tz_offset / 60 + 24) % 24;

      for (const reminder of MEAL_REMINDERS) {
        // Send if local hour is within the 15-min window of the target hour
        if (localHour >= reminder.hour && localHour < reminder.hour + 0.25) {
          const dedupeKey = `${user_id}-${dayKey}-${reminder.hour}`;
          if (lastSent.get(dedupeKey)) continue;

          // Skip if user already logged this meal type today
          try {
            if (await alreadyLoggedToday(user_id, reminder.meal_type, tz_offset)) {
              lastSent.set(dedupeKey, true);
              continue;
            }
          } catch (e) {
            // If the check fails, fall through and send the reminder anyway
          }

          console.log(`Meal reminder: sending "${reminder.title}" to user ${user_id}`);
          await sendNotification(user_id, {
            title: reminder.title,
            body: reminder.body,
            // Deep-link to the dashboard with the quick-log sheet auto-opened
            url: `/?quicklog=${reminder.meal_type}`,
          });
          lastSent.set(dedupeKey, true);
        }
      }
    }

    // Clean stale entries from the dedupe map (older than 2 days)
    if (lastSent.size > 1000) {
      for (const k of lastSent.keys()) {
        const parts = k.split('-');
        const keyDay = parts.slice(1, 4).join('-');
        if (keyDay && keyDay < dayKey) lastSent.delete(k);
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
