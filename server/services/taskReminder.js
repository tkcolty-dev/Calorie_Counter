const pool = require('../config/db');
const { sendNotification } = require('./pushNotifier');

const INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const SNOOZE_MS = 15 * 60 * 1000; // Re-notify every 15 minutes

async function cleanupCompletedTasks() {
  try {
    const result = await pool.query(
      `DELETE FROM tasks WHERE completed_at IS NOT NULL AND completed_at < NOW() - INTERVAL '24 hours'`
    );
    if (result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} completed task(s)`);
    }
  } catch (err) {
    console.error('Task cleanup error:', err);
  }
}

async function checkTaskReminders() {
  try {
    await cleanupCompletedTasks();
    const now = new Date();

    // Find tasks that are due and not completed, and haven't been notified recently
    const { rows } = await pool.query(
      `SELECT t.id, t.user_id, t.title, t.due_at, t.last_notified_at, u.username as creator_username
       FROM tasks t
       JOIN users u ON t.created_by = u.id
       JOIN push_subscriptions ps ON ps.user_id = t.user_id
       WHERE t.completed_at IS NULL
         AND t.due_at <= $1
         AND (t.last_notified_at IS NULL OR t.last_notified_at < $2)`,
      [now.toISOString(), new Date(now.getTime() - SNOOZE_MS).toISOString()]
    );

    for (const task of rows) {
      const isFromOther = task.creator_username !== undefined && task.user_id !== task.created_by;
      const body = isFromOther
        ? `From ${task.creator_username}: "${task.title}"`
        : `"${task.title}"`;

      await sendNotification(task.user_id, {
        title: 'Task Reminder',
        body,
        url: '/tasks',
        tag: `task-${task.id}`,
        renotify: true,
      });

      await pool.query(
        'UPDATE tasks SET last_notified_at = $1 WHERE id = $2',
        [now.toISOString(), task.id]
      );
    }
  } catch (err) {
    console.error('Task reminder check error:', err);
  }
}

function startTaskReminders() {
  console.log('Task reminder scheduler started (every 5 min)');
  setInterval(checkTaskReminders, INTERVAL_MS);
  setTimeout(checkTaskReminders, 8000);
}

module.exports = { startTaskReminders };
