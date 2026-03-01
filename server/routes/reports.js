const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Daily calorie summary for a date range
router.get('/daily-summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const today = req.query.today || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT logged_at::date as date,
              SUM(calories)::int as total_calories,
              SUM(COALESCE(protein_g, 0))::numeric(8,1) as total_protein,
              SUM(COALESCE(carbs_g, 0))::numeric(8,1) as total_carbs,
              SUM(COALESCE(fat_g, 0))::numeric(8,1) as total_fat,
              COUNT(*)::int as meal_count
       FROM meals WHERE user_id = $1
         AND logged_at::date > ($3::date - $2::int)
         AND logged_at::date <= $3::date
       GROUP BY logged_at::date
       ORDER BY date`,
      [req.userId, days, today]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Streaks — consecutive days with at least one logged meal
router.get('/streaks', async (req, res) => {
  try {
    const today = req.query.today || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT DISTINCT logged_at::date as date
       FROM meals WHERE user_id = $1 AND logged_at::date <= $2::date
       ORDER BY date DESC LIMIT 365`,
      [req.userId, today]
    );
    const dates = result.rows.map(r => r.date.toISOString().split('T')[0]);
    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    // Calculate current streak from today backwards
    const todayDate = new Date(today + 'T12:00:00');
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(todayDate);
      checkDate.setDate(checkDate.getDate() - i);
      const ds = checkDate.toISOString().split('T')[0];
      if (dates.includes(ds)) {
        currentStreak = i + 1;
      } else {
        break;
      }
    }

    // Calculate longest streak
    for (let i = 0; i < dates.length; i++) {
      if (i === 0) {
        streak = 1;
      } else {
        const prev = new Date(dates[i - 1] + 'T12:00:00');
        const curr = new Date(dates[i] + 'T12:00:00');
        const diff = (prev - curr) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          streak++;
        } else {
          streak = 1;
        }
      }
      if (streak > longestStreak) longestStreak = streak;
    }

    res.json({ currentStreak, longestStreak, totalDaysLogged: dates.length });
  } catch (err) {
    console.error('Streaks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Averages over a period
router.get('/averages', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const today = req.query.today || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT
         ROUND(AVG(daily_cal))::int as avg_calories,
         ROUND(AVG(daily_protein), 1) as avg_protein,
         ROUND(AVG(daily_carbs), 1) as avg_carbs,
         ROUND(AVG(daily_fat), 1) as avg_fat
       FROM (
         SELECT logged_at::date as d,
                SUM(calories) as daily_cal,
                SUM(COALESCE(protein_g, 0)) as daily_protein,
                SUM(COALESCE(carbs_g, 0)) as daily_carbs,
                SUM(COALESCE(fat_g, 0)) as daily_fat
         FROM meals WHERE user_id = $1
           AND logged_at::date > ($3::date - $2::int)
           AND logged_at::date <= $3::date
         GROUP BY logged_at::date
       ) sub`,
      [req.userId, days, today]
    );
    res.json(result.rows[0] || { avg_calories: 0, avg_protein: 0, avg_carbs: 0, avg_fat: 0 });
  } catch (err) {
    console.error('Averages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Weekly AI summary
router.get('/weekly-summary', async (req, res) => {
  try {
    const today = req.query.today || new Date().toISOString().split('T')[0];
    // Get this week's data (last 7 days)
    const meals = await pool.query(
      `SELECT logged_at::date as date, meal_type, name, calories,
              COALESCE(protein_g, 0) as protein_g, COALESCE(carbs_g, 0) as carbs_g, COALESCE(fat_g, 0) as fat_g
       FROM meals WHERE user_id = $1
         AND logged_at::date > ($2::date - 7) AND logged_at::date <= $2::date
       ORDER BY logged_at`,
      [req.userId, today]
    );
    const goals = await pool.query('SELECT * FROM calorie_goals WHERE user_id = $1', [req.userId]);
    const goal = goals.rows[0] || { daily_total: 2000 };

    if (meals.rows.length === 0) {
      return res.json({ summary: null });
    }

    // Aggregate by day
    const byDay = {};
    meals.rows.forEach(m => {
      const d = m.date.toISOString().split('T')[0];
      if (!byDay[d]) byDay[d] = { total: 0, meals: [] };
      byDay[d].total += m.calories;
      byDay[d].meals.push(m);
    });

    const daysLogged = Object.keys(byDay).length;
    const avgCal = Math.round(Object.values(byDay).reduce((s, d) => s + d.total, 0) / daysLogged);
    const overDays = Object.values(byDay).filter(d => d.total > goal.daily_total).length;

    const { chatWithAI } = require('../services/claude');

    const weekData = `Week summary (last 7 days):
- Days logged: ${daysLogged}/7
- Average calories: ${avgCal} cal/day (goal: ${goal.daily_total})
- Days over budget: ${overDays}
- Total meals: ${meals.rows.length}`;

    const summaryText = await chatWithAI({
      message: `Give me a brief, encouraging weekly summary in 2-3 sentences. Here's my data:\n${weekData}`,
      history: [],
      goals: goal,
      todaysMeals: [],
      remainingCalories: goal.daily_total,
      preferences: [],
      plannedMeals: [],
      clientDate: today,
      foodReference: [],
    });

    // Auto-share summary with partners
    const shareKey = `weekly-summary-shared:${req.userId}:${today}`;
    const alreadyShared = await pool.query(
      `SELECT 1 FROM share_comments
       WHERE sender_id = $1 AND text LIKE '[Weekly Summary]%'
         AND created_at > ($2::date - 1)`,
      [req.userId, today]
    );

    if (alreadyShared.rows.length === 0) {
      // Get all accepted shares (both directions)
      const shares = await pool.query(
        `SELECT s.id FROM shares s
         JOIN share_status ss ON ss.share_id = s.id
         WHERE (s.owner_id = $1 OR s.viewer_id = $1) AND ss.status = 'accepted'`,
        [req.userId]
      );

      if (shares.rows.length > 0) {
        const username = (await pool.query('SELECT username FROM users WHERE id = $1', [req.userId])).rows[0]?.username;
        const shareMsg = `[Weekly Summary] ${daysLogged}/7 days logged, ${avgCal} cal/day avg. ${summaryText}`;
        await Promise.all(shares.rows.map(s =>
          pool.query(
            'INSERT INTO share_comments (share_id, sender_id, text) VALUES ($1, $2, $3)',
            [s.id, req.userId, shareMsg]
          ).catch(() => {})
        ));
      }
    }

    res.json({
      summary: {
        text: summaryText,
        daysLogged,
        avgCal,
        overDays,
        weekOf: today,
      },
    });
  } catch (err) {
    console.error('Weekly summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leaderboard — streaks and consistency for connected users
router.get('/leaderboard', async (req, res) => {
  try {
    const today = req.query.today || new Date().toISOString().split('T')[0];
    // Get users connected via sharing
    const connectedUsers = await pool.query(
      `SELECT DISTINCT u.id, u.username FROM users u
       WHERE u.id IN (
         SELECT viewer_id FROM shares WHERE owner_id = $1
         UNION SELECT owner_id FROM shares WHERE viewer_id = $1
       ) OR u.id = $1`,
      [req.userId]
    );

    const leaderboard = await Promise.all(connectedUsers.rows.map(async (user) => {
      // Get streak
      const dates = await pool.query(
        `SELECT DISTINCT logged_at::date as d FROM meals
         WHERE user_id = $1 AND logged_at::date <= $2::date
         ORDER BY d DESC LIMIT 365`,
        [user.id, today]
      );
      const dList = dates.rows.map(r => r.d.toISOString().split('T')[0]);
      let streak = 0;
      const todayDate = new Date(today + 'T12:00:00');
      for (let i = 0; i < 365; i++) {
        const check = new Date(todayDate);
        check.setDate(check.getDate() - i);
        if (dList.includes(check.toISOString().split('T')[0])) streak = i + 1;
        else break;
      }

      // Days logged in last 30
      const recent = await pool.query(
        `SELECT COUNT(DISTINCT logged_at::date)::int as days FROM meals
         WHERE user_id = $1 AND logged_at::date > ($2::date - 30) AND logged_at::date <= $2::date`,
        [user.id, today]
      );

      return {
        username: user.username,
        currentStreak: streak,
        daysLast30: recent.rows[0]?.days || 0,
      };
    }));

    leaderboard.sort((a, b) => b.currentStreak - a.currentStreak || b.daysLast30 - a.daysLast30);
    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
