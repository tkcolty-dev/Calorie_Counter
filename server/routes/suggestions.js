const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Get smart suggestion based on meal patterns by time of day
router.get('/', async (req, res) => {
  try {
    const today = req.query.today || new Date().toISOString().split('T')[0];
    const hour = parseInt(req.query.hour) || new Date().getHours();

    // Determine meal type by hour
    let mealType;
    if (hour < 11) mealType = 'breakfast';
    else if (hour < 14) mealType = 'lunch';
    else if (hour < 18) mealType = 'snack';
    else mealType = 'dinner';

    // Check if this meal type is already logged today
    const alreadyLogged = await pool.query(
      `SELECT COUNT(*)::int as count FROM meals
       WHERE user_id = $1 AND logged_at::date = $2::date AND meal_type = $3`,
      [req.userId, today, mealType]
    );
    if (alreadyLogged.rows[0].count > 0) {
      return res.json({ suggestion: null });
    }

    // Get most common meals for this type in the last 30 days
    const topMeals = await pool.query(
      `SELECT name, ROUND(AVG(calories))::int as avg_cal, COUNT(*)::int as count
       FROM meals WHERE user_id = $1 AND meal_type = $2
         AND logged_at::date > ($3::date - 30)
       GROUP BY name ORDER BY count DESC LIMIT 3`,
      [req.userId, mealType, today]
    );

    if (topMeals.rows.length === 0) {
      return res.json({ suggestion: null });
    }

    const top = topMeals.rows[0];
    res.json({
      suggestion: {
        meal_type: mealType,
        name: top.name,
        calories: top.avg_cal,
        count: top.count,
        message: `You usually have ${top.name} for ${mealType}. Quick log?`,
      },
    });
  } catch (err) {
    console.error('Suggestions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
