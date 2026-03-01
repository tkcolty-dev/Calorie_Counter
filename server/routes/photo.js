const express = require('express');
const auth = require('../middleware/auth');
const { analyzePhoto } = require('../services/claude');

const router = express.Router();
router.use(auth);

router.post('/analyze', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'image (base64) is required' });
    }
    // Strip data URL prefix if present
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const items = await analyzePhoto(base64);
    res.json({ items });
  } catch (err) {
    console.error('Photo analyze error:', err);
    res.status(500).json({ error: 'Photo analysis failed' });
  }
});

module.exports = router;
