const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM food_preferences WHERE user_id = $1 ORDER BY preference_type, value',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get preferences error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { preference_type, value } = req.body;
    const validTypes = ['cuisine', 'dietary', 'favorite', 'dislike', 'usual_meal'];
    if (!preference_type || !value) {
      return res.status(400).json({ error: 'preference_type and value are required' });
    }
    if (!validTypes.includes(preference_type)) {
      return res.status(400).json({ error: 'preference_type must be cuisine, dietary, favorite, or dislike' });
    }

    const result = await pool.query(
      'INSERT INTO food_preferences (user_id, preference_type, value) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, preference_type, value]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create preference error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM food_preferences WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preference not found' });
    }
    res.json({ message: 'Preference deleted' });
  } catch (err) {
    console.error('Delete preference error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
