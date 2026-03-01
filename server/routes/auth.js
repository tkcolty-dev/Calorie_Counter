const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { usernameContainsProfanity } = require('../utils/profanityFilter');

const router = express.Router();

// Simple server-side CAPTCHA
function generateCaptcha() {
  const a = Math.floor(Math.random() * 20) + 1;
  const b = Math.floor(Math.random() * 20) + 1;
  const ops = [
    { symbol: '+', fn: (x, y) => x + y },
    { symbol: '-', fn: (x, y) => x - y },
  ];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const answer = op.fn(a, b);
  const question = `What is ${a} ${op.symbol} ${b}?`;
  // Sign the answer so it can't be tampered with
  const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET);
  hmac.update(String(answer));
  const token = hmac.digest('hex');
  return { question, token };
}

function verifyCaptcha(answer, token) {
  const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET);
  hmac.update(String(answer));
  return hmac.digest('hex') === token;
}

router.get('/captcha', (req, res) => {
  res.json(generateCaptcha());
});

router.post('/register', async (req, res) => {
  try {
    const { username, password, captchaAnswer, captchaToken } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (!captchaAnswer || !captchaToken) {
      return res.status(400).json({ error: 'CAPTCHA is required' });
    }
    if (!verifyCaptcha(captchaAnswer, captchaToken)) {
      return res.status(400).json({ error: 'Incorrect CAPTCHA answer' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (usernameContainsProfanity(username)) {
      return res.status(400).json({ error: 'Username contains inappropriate language' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, onboarding_complete) VALUES ($1, $2, false) RETURNING id, username, onboarding_complete, created_at',
      [username, password_hash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Create default goals
    await pool.query(
      'INSERT INTO calorie_goals (user_id, daily_total) VALUES ($1, 2000)',
      [user.id]
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(
      'SELECT id, username, password_hash, onboarding_complete, created_at FROM users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...userWithoutPassword } = user;

    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.username, u.onboarding_complete, u.created_at, a.filename as avatar_filename FROM users u LEFT JOIN avatars a ON a.user_id = u.id WHERE u.id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    if (user.avatar_filename) {
      user.avatar_url = `/api/avatars/${user.avatar_filename}`;
    }
    res.json({ user });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/complete-onboarding', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET onboarding_complete = true WHERE id = $1',
      [req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Complete onboarding error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
