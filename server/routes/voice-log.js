const express = require('express');
const auth = require('../middleware/auth');
const { parseVoiceInput } = require('../services/claude');
const { searchLocalDB, searchOpenFoodFacts } = require('../services/foodSearch');

const router = express.Router();
router.use(auth);

router.post('/', async (req, res) => {
  try {
    const { transcript, today } = req.body;
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'transcript is required' });
    }

    // Infer meal_type from time of day
    const now = new Date();
    const hour = now.getHours();
    let defaultMealType = 'snack';
    if (hour < 11) defaultMealType = 'breakfast';
    else if (hour < 15) defaultMealType = 'lunch';
    else if (hour < 20) defaultMealType = 'dinner';

    // Extract food search terms from transcript
    const words = transcript.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const skipWords = new Set(['the', 'and', 'for', 'can', 'you', 'had', 'ate', 'just', 'some', 'with', 'two', 'three', 'four', 'five', 'six', 'piece', 'pieces', 'cup', 'cups', 'bowl', 'plate', 'glass', 'slice', 'slices']);
    const searchTerms = new Set();
    if (transcript.length < 60) searchTerms.add(transcript.trim().toLowerCase());
    for (const w of words) {
      if (!skipWords.has(w)) searchTerms.add(w);
    }

    // Look up calorie reference data
    let foodReference = [];
    try {
      const searches = [...searchTerms].slice(0, 4);
      const [localResults, offResults] = await Promise.all([
        Promise.all(searches.map(t => searchLocalDB(t).catch(() => []))),
        Promise.all(searches.map(t => searchOpenFoodFacts(t).catch(() => []))),
      ]);
      const seen = new Set();
      for (const rows of localResults) {
        for (const r of rows) {
          const key = r.name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            foodReference.push({
              name: r.name,
              calories_per_serving: r.calories_per_serving,
              serving_size: r.serving_size || '1 serving',
              protein_g: r.protein_g || null,
              carbs_g: r.carbs_g || null,
              fat_g: r.fat_g || null,
            });
          }
        }
      }
      for (const rows of offResults) {
        for (const r of rows) {
          const label = r.brand ? `${r.name} (${r.brand})` : r.name;
          const key = label.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            foodReference.push({
              name: label,
              calories_per_serving: r.calories_per_serving,
              serving_size: r.serving_size || '1 serving',
              protein_g: r.protein_g || null,
              carbs_g: r.carbs_g || null,
              fat_g: r.fat_g || null,
            });
          }
        }
      }
      foodReference = foodReference.slice(0, 20);
    } catch {}

    const meals = await parseVoiceInput({ transcript, foodReference, defaultMealType });
    res.json({ meals });
  } catch (err) {
    console.error('Voice log error:', err);
    res.status(500).json({ error: 'Failed to parse voice input' });
  }
});

module.exports = router;
