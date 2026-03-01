const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Get all custom meals for user
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT * FROM custom_meals WHERE user_id = $1';
    if (req.query.templates === 'true') {
      query += ' AND is_template = true';
    } else if (req.query.templates === 'false') {
      query += ' AND is_template = false';
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, [req.userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get custom meals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a custom meal
router.post('/', async (req, res) => {
  try {
    const { name, meal_type, calories, ingredients, notes, protein_g, carbs_g, fat_g, template_items, is_template } = req.body;
    if (!name || !meal_type || calories == null) {
      return res.status(400).json({ error: 'name, meal_type, and calories are required' });
    }
    const result = await pool.query(
      `INSERT INTO custom_meals (user_id, name, meal_type, calories, ingredients, notes, protein_g, carbs_g, fat_g, template_items, is_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.userId, name, meal_type, parseInt(calories), ingredients || null, notes || null, protein_g || null, carbs_g || null, fat_g || null, template_items ? JSON.stringify(template_items) : null, !!is_template]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create custom meal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a custom meal
router.put('/:id', async (req, res) => {
  try {
    const { name, meal_type, calories, ingredients, notes, protein_g, carbs_g, fat_g } = req.body;
    const result = await pool.query(
      `UPDATE custom_meals SET name = COALESCE($1, name), meal_type = COALESCE($2, meal_type),
       calories = COALESCE($3, calories), ingredients = COALESCE($4, ingredients), notes = COALESCE($5, notes),
       protein_g = COALESCE($8, protein_g), carbs_g = COALESCE($9, carbs_g), fat_g = COALESCE($10, fat_g)
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [name, meal_type, calories != null ? parseInt(calories) : null, ingredients, notes, req.params.id, req.userId, protein_g ?? null, carbs_g ?? null, fat_g ?? null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Custom meal not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update custom meal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a custom meal
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM custom_meals WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Custom meal not found' });
    }
    res.json({ message: 'Custom meal deleted' });
  } catch (err) {
    console.error('Delete custom meal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
