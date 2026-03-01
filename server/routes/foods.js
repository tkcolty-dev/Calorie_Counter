const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { searchFoods } = require('../services/foodSearch');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const [results, favsResult] = await Promise.all([
      searchFoods(q),
      pool.query(
        "SELECT LOWER(value) as value FROM food_preferences WHERE user_id = $1 AND preference_type = 'favorite'",
        [req.userId]
      ),
    ]);

    if (favsResult.rows.length > 0) {
      const favSet = new Set(favsResult.rows.map(r => r.value));
      // Mark and sort favorites to the top
      for (const r of results) {
        if (favSet.has(r.name.toLowerCase())) {
          r.isFavorite = true;
        }
      }
      results.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return 0;
      });
    }

    res.json(results);
  } catch (err) {
    console.error('Food search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
