const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Get weight history (last N entries)
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 90;
    const result = await pool.query(
      `SELECT * FROM weight_log WHERE user_id = $1 ORDER BY logged_date DESC LIMIT $2`,
      [req.userId, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get weight log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Log weight for a date (upsert)
router.post('/', async (req, res) => {
  try {
    const { weight_lbs, logged_date, notes } = req.body;
    if (!weight_lbs || !logged_date) {
      return res.status(400).json({ error: 'weight_lbs and logged_date are required' });
    }
    const result = await pool.query(
      `INSERT INTO weight_log (user_id, weight_lbs, logged_date, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, logged_date)
       DO UPDATE SET weight_lbs = $2, notes = $4
       RETURNING *`,
      [req.userId, parseFloat(weight_lbs), logged_date, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Log weight error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a weight entry
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM weight_log WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Weight entry not found' });
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete weight error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
