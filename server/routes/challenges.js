const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// List challenges the user created or joined
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.username as creator_username,
              (SELECT COUNT(*)::int FROM challenge_participants WHERE challenge_id = c.id) as participant_count,
              EXISTS(SELECT 1 FROM challenge_participants WHERE challenge_id = c.id AND user_id = $1) as joined
       FROM challenges c
       JOIN users u ON u.id = c.creator_id
       WHERE c.creator_id = $1
          OR c.id IN (SELECT challenge_id FROM challenge_participants WHERE user_id = $1)
          OR c.creator_id IN (SELECT owner_id FROM shares WHERE viewer_id = $1)
          OR c.creator_id IN (SELECT viewer_id FROM shares WHERE owner_id = $1)
       ORDER BY c.end_date DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get challenges error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a challenge
router.post('/', async (req, res) => {
  try {
    const { title, description, challenge_type, target_value, start_date, end_date } = req.body;
    if (!title || !challenge_type || !target_value || !start_date || !end_date) {
      return res.status(400).json({ error: 'title, challenge_type, target_value, start_date, and end_date are required' });
    }
    const validTypes = ['streak', 'total_calories', 'under_budget'];
    if (!validTypes.includes(challenge_type)) {
      return res.status(400).json({ error: 'challenge_type must be streak, total_calories, or under_budget' });
    }
    const result = await pool.query(
      `INSERT INTO challenges (creator_id, title, description, challenge_type, target_value, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, title, description || null, challenge_type, parseInt(target_value), start_date, end_date]
    );
    // Auto-join creator
    await pool.query(
      `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2)`,
      [result.rows[0].id, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create challenge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join a challenge
router.post('/:id/join', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.userId]
    );
    res.json({ message: 'Joined' });
  } catch (err) {
    console.error('Join challenge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get challenge detail with progress
router.get('/:id', async (req, res) => {
  try {
    const challenge = await pool.query(
      `SELECT c.*, u.username as creator_username FROM challenges c JOIN users u ON u.id = c.creator_id WHERE c.id = $1`,
      [req.params.id]
    );
    if (challenge.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    const c = challenge.rows[0];

    // Get participants with their progress
    const participants = await pool.query(
      `SELECT cp.user_id, u.username, cp.joined_at
       FROM challenge_participants cp JOIN users u ON u.id = cp.user_id
       WHERE cp.challenge_id = $1 ORDER BY cp.joined_at`,
      [req.params.id]
    );

    // Calculate progress per participant
    const progressPromises = participants.rows.map(async (p) => {
      let progress = 0;
      if (c.challenge_type === 'streak') {
        // Count consecutive days logged within challenge period
        const days = await pool.query(
          `SELECT DISTINCT logged_at::date as d FROM meals
           WHERE user_id = $1 AND logged_at::date >= $2 AND logged_at::date <= $3
           ORDER BY d`,
          [p.user_id, c.start_date, c.end_date]
        );
        let streak = 0, maxStreak = 0;
        const dates = days.rows.map(r => r.d.toISOString().split('T')[0]);
        for (let i = 0; i < dates.length; i++) {
          if (i === 0) { streak = 1; }
          else {
            const prev = new Date(dates[i-1] + 'T12:00:00');
            const curr = new Date(dates[i] + 'T12:00:00');
            streak = ((curr - prev) / 86400000 === 1) ? streak + 1 : 1;
          }
          maxStreak = Math.max(maxStreak, streak);
        }
        progress = maxStreak;
      } else if (c.challenge_type === 'under_budget') {
        // Count days under budget
        const goals = await pool.query('SELECT daily_total FROM calorie_goals WHERE user_id = $1', [p.user_id]);
        const budget = goals.rows[0]?.daily_total || 2000;
        const days = await pool.query(
          `SELECT logged_at::date as d, SUM(calories)::int as total
           FROM meals WHERE user_id = $1 AND logged_at::date >= $2 AND logged_at::date <= $3
           GROUP BY d`,
          [p.user_id, c.start_date, c.end_date]
        );
        progress = days.rows.filter(d => d.total <= budget).length;
      }
      return { ...p, progress, target: c.target_value };
    });

    const participantsWithProgress = await Promise.all(progressPromises);
    res.json({ ...c, participants: participantsWithProgress });
  } catch (err) {
    console.error('Get challenge detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
