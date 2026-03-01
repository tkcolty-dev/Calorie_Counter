const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Get planned meals for a date range
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required' });
    }
    const result = await pool.query(
      `SELECT * FROM planned_meals
       WHERE user_id = $1 AND planned_date >= $2 AND planned_date <= $3
       ORDER BY planned_date, created_at`,
      [req.userId, from, to]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get planned meals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a planned meal
router.post('/', async (req, res) => {
  try {
    const { meal_type, name, calories, notes, planned_date, protein_g, carbs_g, fat_g, recurrence, recurrence_end, for_user_id } = req.body;
    if (!meal_type || !name || calories == null || !planned_date) {
      return res.status(400).json({ error: 'meal_type, name, calories, and planned_date are required' });
    }

    const validTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validTypes.includes(meal_type)) {
      return res.status(400).json({ error: 'meal_type must be breakfast, lunch, dinner, or snack' });
    }

    const validRecurrence = [null, 'daily', 'weekly'];
    if (recurrence && !validRecurrence.includes(recurrence)) {
      return res.status(400).json({ error: 'recurrence must be daily or weekly' });
    }

    // If planning for another user, verify an accepted share exists (either direction)
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
      `INSERT INTO planned_meals (user_id, meal_type, name, calories, notes, planned_date, protein_g, carbs_g, fat_g, recurrence, recurrence_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [targetUserId, meal_type, name, parseInt(calories), notes || null, planned_date, protein_g || null, carbs_g || null, fat_g || null, recurrence || null, recurrence_end || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create planned meal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Log a planned meal — move from planned_meals to meals
router.post('/:id/log', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const planned = await client.query(
      'SELECT * FROM planned_meals WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (planned.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Planned meal not found' });
    }

    const meal = planned.rows[0];
    const logged_at = req.body.logged_at || new Date();

    const inserted = await client.query(
      `INSERT INTO meals (user_id, meal_type, name, calories, notes, logged_at, protein_g, carbs_g, fat_g)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.userId, meal.meal_type, meal.name, meal.calories, meal.notes, logged_at, meal.protein_g || null, meal.carbs_g || null, meal.fat_g || null]
    );

    await client.query(
      'DELETE FROM planned_meals WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    // If recurring, create next occurrence
    if (meal.recurrence) {
      const currentDate = new Date(meal.planned_date + 'T12:00:00');
      const days = meal.recurrence === 'daily' ? 1 : 7;
      currentDate.setDate(currentDate.getDate() + days);
      const nextDate = currentDate.toISOString().split('T')[0];
      const endDate = meal.recurrence_end;
      if (!endDate || nextDate <= endDate) {
        await client.query(
          `INSERT INTO planned_meals (user_id, meal_type, name, calories, notes, planned_date, protein_g, carbs_g, fat_g, recurrence, recurrence_end, parent_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [req.userId, meal.meal_type, meal.name, meal.calories, meal.notes, nextDate, meal.protein_g, meal.carbs_g, meal.fat_g, meal.recurrence, meal.recurrence_end, meal.parent_id || meal.id]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Log planned meal error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete a planned meal
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM planned_meals WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Planned meal not found' });
    }
    res.json({ message: 'Planned meal deleted' });
  } catch (err) {
    console.error('Delete planned meal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
