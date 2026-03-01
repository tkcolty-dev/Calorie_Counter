const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

// Serve avatar image (public, no auth needed)
router.get('/:filename', async (req, res) => {
  try {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const { rows } = await pool.query(
      'SELECT mime_type, data FROM avatars WHERE filename = $1',
      [filename]
    );
    if (rows.length === 0) return res.status(404).send('Not found');
    res.set('Content-Type', rows[0].mime_type);
    res.set('Cache-Control', 'public, max-age=300');
    res.send(rows[0].data);
  } catch (err) {
    console.error('Serve avatar error:', err);
    res.status(500).send('Server error');
  }
});

// Upload avatar (auth required)
router.post('/upload', auth, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No image provided' });
    }

    const match = image.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const mimeType = `image/${match[1]}`;
    const buffer = Buffer.from(match[2], 'base64');

    if (buffer.length > 512000) {
      return res.status(400).json({ error: 'Image too large (max 500KB)' });
    }

    // AI-based image moderation
    try {
      const { getGenAIConfig } = require('../services/claude');
      const config = getGenAIConfig();
      if (config.apiBase) {
        const modRes = await fetch(`${config.apiBase}/openai/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: 'system', content: 'You are a content moderator. Respond with ONLY "safe" or "unsafe". An image is unsafe if it contains: nudity, sexual content, gore, violence, hate symbols, drug use, or inappropriate content.' },
              { role: 'user', content: [
                { type: 'text', text: 'Is this profile picture safe? Reply only "safe" or "unsafe".' },
                { type: 'image_url', image_url: { url: image } },
              ]},
            ],
            max_tokens: 10,
          }),
        });
        if (modRes.ok) {
          const modData = await modRes.json();
          const verdict = modData.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
          if (verdict.includes('unsafe')) {
            return res.status(400).json({ error: 'This image is not appropriate. Please choose a different picture.' });
          }
        }
      }
    } catch (e) {
      console.error('Image moderation error:', e.message);
      // Allow upload if moderation fails
    }

    const filename = `${req.userId}.${ext}`;

    await pool.query(
      `INSERT INTO avatars (user_id, filename, mime_type, data) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET filename = $2, mime_type = $3, data = $4`,
      [req.userId, filename, mimeType, buffer]
    );

    res.json({ ok: true, avatarUrl: `/api/avatars/${filename}` });
  } catch (err) {
    console.error('Upload avatar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete avatar (auth required)
router.delete('/mine', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM avatars WHERE user_id = $1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete avatar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if user has avatar
router.get('/check/:userId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT filename FROM avatars WHERE user_id = $1',
      [req.params.userId]
    );
    if (rows.length > 0) {
      res.json({ hasAvatar: true, avatarUrl: `/api/avatars/${rows[0].filename}` });
    } else {
      res.json({ hasAvatar: false });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
