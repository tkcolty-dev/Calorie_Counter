const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Get meal history grouped by date (excludes today)
router.get('/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const today = req.query.today || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT * FROM meals WHERE user_id = $1
        AND logged_at::date >= $3::date - $2::int
        AND logged_at::date < $3::date
       ORDER BY logged_at DESC`,
      [req.userId, days, today]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get meal history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get top foods by frequency
router.get('/top-foods', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const today = req.query.today || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT name, COUNT(*)::int as count, ROUND(AVG(calories))::int as avg_calories,
              SUM(calories)::int as total_calories
       FROM meals WHERE user_id = $1
        AND logged_at::date >= $3::date - $2::int
       GROUP BY name ORDER BY count DESC LIMIT 10`,
      [req.userId, days, today]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get top foods error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get meals for a date
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    let query, params;

    if (date) {
      query = `SELECT * FROM meals WHERE user_id = $1 AND logged_at::date = $2 ORDER BY logged_at`;
      params = [req.userId, date];
    } else {
      query = `SELECT * FROM meals WHERE user_id = $1 AND logged_at::date = CURRENT_DATE ORDER BY logged_at`;
      params = [req.userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get meals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a meal
router.post('/', async (req, res) => {
  try {
    const { meal_type, name, calories, notes, logged_at, protein_g, carbs_g, fat_g, for_user_id } = req.body;
    if (!meal_type || !name || calories == null) {
      return res.status(400).json({ error: 'meal_type, name, and calories are required' });
    }

    const validTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validTypes.includes(meal_type)) {
      return res.status(400).json({ error: 'meal_type must be breakfast, lunch, dinner, or snack' });
    }

    // If logging for another user, verify an accepted share exists (either direction)
    let targetUserId = req.userId;
    if (for_user_id && for_user_id !== req.userId) {
      const shareCheck = await pool.query(
        `SELECT s.id FROM shares s
         JOIN share_status ss ON ss.share_id = s.id
         WHERE ((s.owner_id = $1 AND s.viewer_id = $2) OR (s.owner_id = $2 AND s.viewer_id = $1))
           AND ss.status = 'accepted'`,
        [for_user_id, req.userId]
      );
      if (shareCheck.rows.length === 0) {
        return res.status(403).json({ error: 'No accepted share with this user' });
      }
      targetUserId = for_user_id;
    }

    const result = await pool.query(
      `INSERT INTO meals (user_id, meal_type, name, calories, notes, logged_at, protein_g, carbs_g, fat_g)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [targetUserId, meal_type, name, parseInt(calories), notes || null, logged_at || new Date(), protein_g || null, carbs_g || null, fat_g || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create meal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a meal
router.put('/:id', async (req, res) => {
  try {
    const { meal_type, name, calories, notes, protein_g, carbs_g, fat_g } = req.body;
    const result = await pool.query(
      `UPDATE meals SET meal_type = COALESCE($1, meal_type), name = COALESCE($2, name),
       calories = COALESCE($3, calories), notes = COALESCE($4, notes),
       protein_g = COALESCE($7, protein_g), carbs_g = COALESCE($8, carbs_g), fat_g = COALESCE($9, fat_g)
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [meal_type, name, calories != null ? parseInt(calories) : null, notes, req.params.id, req.userId, protein_g ?? null, carbs_g ?? null, fat_g ?? null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update meal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Copy all meals from one date to another
router.post('/copy-day', async (req, res) => {
  try {
    const { from_date, to_date } = req.body;
    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required' });
    }
    const source = await pool.query(
      `SELECT meal_type, name, calories, notes, protein_g, carbs_g, fat_g FROM meals
       WHERE user_id = $1 AND logged_at::date = $2::date ORDER BY logged_at`,
      [req.userId, from_date]
    );
    if (source.rows.length === 0) {
      return res.status(400).json({ error: 'No meals found on the source date' });
    }
    const inserted = [];
    for (const m of source.rows) {
      const r = await pool.query(
        `INSERT INTO meals (user_id, meal_type, name, calories, notes, logged_at, protein_g, carbs_g, fat_g)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.userId, m.meal_type, m.name, m.calories, m.notes, to_date + 'T12:00:00', m.protein_g, m.carbs_g, m.fat_g]
      );
      inserted.push(r.rows[0]);
    }
    res.status(201).json(inserted);
  } catch (err) {
    console.error('Copy day error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete all meals for a given date (defaults to today)
router.delete('/today', async (req, res) => {
  try {
    const today = req.query.today || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'DELETE FROM meals WHERE user_id = $1 AND logged_at::date = $2::date RETURNING id',
      [req.userId, today]
    );
    res.json({ message: `Deleted ${result.rowCount} meals`, count: result.rowCount });
  } catch (err) {
    console.error('Delete today meals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a meal
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM meals WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    res.json({ message: 'Meal deleted' });
  } catch (err) {
    console.error('Delete meal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
