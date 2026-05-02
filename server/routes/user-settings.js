const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Allowlist of keys we'll persist. Prevents arbitrary client junk being
// written to the database and keeps the schema-of-sorts visible here.
const ALLOWED_KEYS = new Set([
  'theme',
  'fab-hint-enabled',
  'home-buttons',
  'show-streak',
  'show-suggestion-banner',
  'show-weekly-summary',
  'show-quick-actions-bar',
  'show-planner',
  'compact-ui',
  'large-text',
  'share-weight',
  'show-log-search',
  'show-log-describe',
]);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT settings FROM user_settings WHERE user_id = $1',
      [req.userId]
    );
    res.json({ settings: rows[0]?.settings || {} });
  } catch (err) {
    console.error('Get user settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Merge-style update: client sends one or more {key: value} pairs; we shallow-
// merge into the stored blob so the client never has to read-modify-write
// the entire object.
router.patch('/', async (req, res) => {
  try {
    const incoming = req.body || {};
    if (typeof incoming !== 'object' || Array.isArray(incoming)) {
      return res.status(400).json({ error: 'Body must be an object' });
    }
    const filtered = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (ALLOWED_KEYS.has(k)) filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) {
      // Nothing the server cares about — still return current state.
      const { rows } = await pool.query('SELECT settings FROM user_settings WHERE user_id = $1', [req.userId]);
      return res.json({ settings: rows[0]?.settings || {} });
    }

    // Upsert + JSONB merge in one round trip.
    const { rows } = await pool.query(
      `INSERT INTO user_settings (user_id, settings, updated_at)
         VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET settings = user_settings.settings || EXCLUDED.settings,
             updated_at = NOW()
       RETURNING settings`,
      [req.userId, JSON.stringify(filtered)]
    );
    res.json({ settings: rows[0].settings });
  } catch (err) {
    console.error('Patch user settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset', async (req, res) => {
  try {
    await pool.query('DELETE FROM user_settings WHERE user_id = $1', [req.userId]);
    res.json({ settings: {} });
  } catch (err) {
    console.error('Reset user settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
