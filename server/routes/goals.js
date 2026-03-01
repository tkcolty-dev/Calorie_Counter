const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM calorie_goals WHERE user_id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.json({ daily_total: 2000, breakfast: null, lunch: null, dinner: null, snacks: null, protein_goal_g: null, carbs_goal_g: null, fat_goal_g: null, target_weight_lbs: null });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get goals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', async (req, res) => {
  try {
    const { daily_total, breakfast, lunch, dinner, snacks, protein_goal_g, carbs_goal_g, fat_goal_g, target_weight_lbs } = req.body;
    if (!daily_total || daily_total < 0) {
      return res.status(400).json({ error: 'daily_total is required and must be positive' });
    }

    const result = await pool.query(
      `INSERT INTO calorie_goals (user_id, daily_total, breakfast, lunch, dinner, snacks, protein_goal_g, carbs_goal_g, fat_goal_g, target_weight_lbs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id)
       DO UPDATE SET daily_total = $2, breakfast = $3, lunch = $4, dinner = $5, snacks = $6, protein_goal_g = $7, carbs_goal_g = $8, fat_goal_g = $9, target_weight_lbs = $10
       RETURNING *`,
      [req.userId, daily_total, breakfast || null, lunch || null, dinner || null, snacks || null, protein_goal_g || null, carbs_goal_g || null, fat_goal_g || null, target_weight_lbs || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update goals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
