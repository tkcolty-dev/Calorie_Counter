const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Get chat history
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT role, content FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get chat history error:', err);
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

// Append messages (batch save)
router.post('/', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    const values = [];
    const params = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m.role || !m.content) continue;
      const offset = i * 3;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
      params.push(req.userId, m.role, m.content);
    }
    if (values.length > 0) {
      await pool.query(
        `INSERT INTO chat_messages (user_id, role, content) VALUES ${values.join(', ')}`,
        params
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Save chat history error:', err);
    res.status(500).json({ error: 'Failed to save chat history' });
  }
});

// Clear chat history
router.delete('/', async (req, res) => {
  try {
    await pool.query('DELETE FROM chat_messages WHERE user_id = $1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Clear chat history error:', err);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

module.exports = router;
