const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { containsProfanity } = require('../utils/profanityFilter');

const router = express.Router();
router.use(auth);

// List tasks for the current user
router.get('/', async (req, res) => {
  try {
    const { status } = req.query; // 'pending', 'completed', or 'all' (default: all)
    let where = 'WHERE t.user_id = $1';
    if (status === 'pending') where += ' AND t.completed_at IS NULL';
    else if (status === 'completed') where += ' AND t.completed_at IS NOT NULL';

    const result = await pool.query(
      `SELECT t.*, u.username as created_by_username
       FROM tasks t
       JOIN users u ON t.created_by = u.id
       ${where}
       ORDER BY t.completed_at IS NULL DESC, t.due_at ASC`,
      [req.userId]
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a task (for yourself or a shared user)
router.post('/', async (req, res) => {
  try {
    const { title, note, due_at, for_user_id } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!due_at) {
      return res.status(400).json({ error: 'Due time is required' });
    }
    if (containsProfanity(title) || (note && containsProfanity(note))) {
      return res.status(400).json({ error: 'Task contains inappropriate language' });
    }

    let targetUserId = req.userId;

    // If creating for someone else, verify accepted share exists
    if (for_user_id && for_user_id !== req.userId) {
      const access = await pool.query(
        `SELECT s.id FROM shares s
         JOIN share_status ss ON ss.share_id = s.id
         WHERE ((s.owner_id = $1 AND s.viewer_id = $2) OR (s.owner_id = $2 AND s.viewer_id = $1))
           AND ss.status = 'accepted'`,
        [req.userId, for_user_id]
      );
      if (access.rows.length === 0) {
        return res.status(403).json({ error: 'You can only add tasks for users who share with you' });
      }
      targetUserId = for_user_id;
    }

    const result = await pool.query(
      `INSERT INTO tasks (user_id, created_by, title, note, due_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *, (SELECT username FROM users WHERE id = $2) as created_by_username`,
      [targetUserId, req.userId, title.trim(), note?.trim() || null, due_at]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle task completion
router.patch('/:id/complete', async (req, res) => {
  try {
    // Get current state
    const task = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (task.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const newCompleted = task.rows[0].completed_at ? null : new Date().toISOString();
    const result = await pool.query(
      `UPDATE tasks SET completed_at = $1 WHERE id = $2 AND user_id = $3
       RETURNING *, (SELECT username FROM users WHERE id = tasks.created_by) as created_by_username`,
      [newCompleted, req.params.id, req.userId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Complete task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a task
router.patch('/:id', async (req, res) => {
  try {
    const { title, note, due_at } = req.body;
    const task = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (task.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (title && containsProfanity(title)) {
      return res.status(400).json({ error: 'Task contains inappropriate language' });
    }
    if (note && containsProfanity(note)) {
      return res.status(400).json({ error: 'Task contains inappropriate language' });
    }

    const result = await pool.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        note = COALESCE($2, note),
        due_at = COALESCE($3, due_at)
       WHERE id = $4 AND user_id = $5
       RETURNING *, (SELECT username FROM users WHERE id = tasks.created_by) as created_by_username`,
      [title?.trim(), note?.trim(), due_at, req.params.id, req.userId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a task (owner or creator can delete)
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND (user_id = $2 OR created_by = $2) RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get shared users you can assign tasks to
router.get('/assignable-users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.username FROM users u
       JOIN shares s ON (s.owner_id = u.id OR s.viewer_id = u.id)
       JOIN share_status ss ON ss.share_id = s.id
       WHERE (s.owner_id = $1 OR s.viewer_id = $1)
         AND ss.status = 'accepted'
         AND u.id != $1
       ORDER BY u.username`,
      [req.userId]
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get assignable users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
