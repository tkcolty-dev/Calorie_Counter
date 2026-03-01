const express = require('express');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const resp = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`
    );
    if (!resp.ok) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const data = await resp.json();
    if (data.status !== 1 || !data.product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const p = data.product;
    const n = p.nutriments || {};
    const calServing = n['energy-kcal_serving'];
    const cal100g = n['energy-kcal_100g'];
    const calories = calServing ? Math.round(calServing) : cal100g ? Math.round(cal100g) : null;
    const servingSize = calServing && p.serving_size ? p.serving_size : cal100g ? 'per 100g' : '1 serving';

    res.json({
      name: p.product_name || 'Unknown Product',
      brand: p.brands || null,
      calories_per_serving: calories,
      serving_size: servingSize,
      protein_g: n['proteins_serving'] != null ? Math.round(n['proteins_serving'] * 10) / 10 : n['proteins_100g'] != null ? Math.round(n['proteins_100g'] * 10) / 10 : null,
      carbs_g: n['carbohydrates_serving'] != null ? Math.round(n['carbohydrates_serving'] * 10) / 10 : n['carbohydrates_100g'] != null ? Math.round(n['carbohydrates_100g'] * 10) / 10 : null,
      fat_g: n['fat_serving'] != null ? Math.round(n['fat_serving'] * 10) / 10 : n['fat_100g'] != null ? Math.round(n['fat_100g'] * 10) / 10 : null,
      barcode: code,
    });
  } catch (err) {
    console.error('Barcode lookup error:', err);
    res.status(500).json({ error: 'Barcode lookup failed' });
  }
});

module.exports = router;
