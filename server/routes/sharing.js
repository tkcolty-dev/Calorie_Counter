const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { containsProfanity } = require('../utils/profanityFilter');

const router = express.Router();
router.use(auth);

// List who you share with + who shares with you
router.get('/', async (req, res) => {
  try {
    const [sharing, sharedWithMe] = await Promise.all([
      pool.query(
        `SELECT s.id, s.viewer_id, u.username as viewer_username, s.share_planned, ss.status, s.created_at
         FROM shares s
         JOIN users u ON s.viewer_id = u.id
         LEFT JOIN share_status ss ON ss.share_id = s.id
         WHERE s.owner_id = $1`,
        [req.userId]
      ),
      pool.query(
        `SELECT s.id, s.owner_id, u.username as owner_username, s.share_planned, ss.status, s.created_at
         FROM shares s
         JOIN users u ON s.owner_id = u.id
         LEFT JOIN share_status ss ON ss.share_id = s.id
         WHERE s.viewer_id = $1`,
        [req.userId]
      ),
    ]);

    res.json({
      sharing: sharing.rows,
      sharedWithMe: sharedWithMe.rows,
    });
  } catch (err) {
    console.error('Get sharing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Quick today-calorie totals for everyone the requester can view (i.e. people
// who accepted-share with them). Returns one row per accepted-incoming share
// so the Sharing page can show inline totals without expanding each card.
router.get('/today-totals', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT s.owner_id AS user_id,
              u.username,
              COALESCE(SUM(m.calories), 0)::int AS total_calories,
              COUNT(m.id)::int AS meal_count
       FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN meals m ON m.user_id = s.owner_id AND m.logged_at::date = $2::date
       WHERE s.viewer_id = $1 AND ss.status = 'accepted'
       GROUP BY s.owner_id, u.username
       ORDER BY u.username`,
      [req.userId, date]
    );
    res.json({ totals: result.rows });
  } catch (err) {
    console.error('Sharing today-totals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Weight summary for everyone the requester can view, but only for owners
// who explicitly opted in by enabling 'share-weight' in their user_settings.
// Returns current weight (latest entry), target weight, lbs to goal, and
// today's delta (today's latest minus yesterday's latest).
router.get('/weight-summary', async (req, res) => {
  try {
    const result = await pool.query(
      `WITH viewable AS (
         SELECT s.owner_id AS user_id, u.username
         FROM shares s
         JOIN share_status ss ON ss.share_id = s.id
         JOIN users u ON u.id = s.owner_id
         WHERE s.viewer_id = $1 AND ss.status = 'accepted'
       ),
       opted_in AS (
         SELECT v.user_id, v.username
         FROM viewable v
         LEFT JOIN user_settings us ON us.user_id = v.user_id
         WHERE COALESCE((us.settings->>'share-weight')::boolean, false) = true
       ),
       latest AS (
         SELECT DISTINCT ON (user_id) user_id, weight_lbs, logged_date
         FROM weight_log
         WHERE user_id IN (SELECT user_id FROM opted_in)
         ORDER BY user_id, logged_date DESC, id DESC
       ),
       prev AS (
         SELECT DISTINCT ON (wl.user_id) wl.user_id, wl.weight_lbs, wl.logged_date
         FROM weight_log wl
         JOIN latest l ON l.user_id = wl.user_id
         WHERE wl.logged_date < l.logged_date
         ORDER BY wl.user_id, wl.logged_date DESC, wl.id DESC
       )
       SELECT o.user_id, o.username,
              l.weight_lbs::float AS current_weight,
              l.logged_date AS current_date,
              cg.target_weight_lbs::float AS target_weight,
              p.weight_lbs::float AS prev_weight,
              p.logged_date AS prev_date
       FROM opted_in o
       LEFT JOIN latest l ON l.user_id = o.user_id
       LEFT JOIN prev p ON p.user_id = o.user_id
       LEFT JOIN calorie_goals cg ON cg.user_id = o.user_id
       ORDER BY o.username`,
      [req.userId]
    );
    const summary = result.rows.map(r => {
      const cur = r.current_weight;
      const goal = r.target_weight;
      const prev = r.prev_weight;
      return {
        user_id: r.user_id,
        username: r.username,
        current_weight: cur,
        current_date: r.current_date,
        target_weight: goal,
        lbs_to_goal: cur != null && goal != null ? +(cur - goal).toFixed(1) : null,
        delta_since_last: cur != null && prev != null ? +(cur - prev).toFixed(1) : null,
        prev_date: r.prev_date,
      };
    });
    res.json({ summary });
  } catch (err) {
    console.error('Sharing weight-summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Weight history of an owner — only returns rows when the owner opted in
// to share-weight. Used by the Sharing expanded chart view.
router.get('/:userId/weight-history', async (req, res) => {
  try {
    const ownerId = parseInt(req.params.userId);
    if (!ownerId) return res.status(400).json({ error: 'Invalid userId' });
    const days = Math.min(parseInt(req.query.days) || 90, 365);
    const accept = await pool.query(
      `SELECT s.id FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       WHERE s.owner_id = $1 AND s.viewer_id = $2 AND ss.status = 'accepted'`,
      [ownerId, req.userId]
    );
    if (accept.rows.length === 0) return res.status(403).json({ error: 'No accepted share' });
    const opt = await pool.query(
      `SELECT COALESCE((settings->>'share-weight')::boolean, false) AS share_weight
       FROM user_settings WHERE user_id = $1`,
      [ownerId]
    );
    if (!opt.rows[0]?.share_weight) return res.status(403).json({ error: 'Owner has not enabled weight sharing' });
    const target = await pool.query(
      `SELECT target_weight_lbs::float AS target FROM calorie_goals WHERE user_id = $1`,
      [ownerId]
    );
    const entries = await pool.query(
      `SELECT id, weight_lbs::float AS weight_lbs, logged_date, notes
       FROM weight_log
       WHERE user_id = $1 AND logged_date >= CURRENT_DATE - $2::int
       ORDER BY logged_date ASC, id ASC`,
      [ownerId, days]
    );
    res.json({
      entries: entries.rows,
      target_weight: target.rows[0]?.target ?? null,
    });
  } catch (err) {
    console.error('Sharing weight-history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Grant access to a user
router.post('/', async (req, res) => {
  try {
    let { viewer_username } = req.body;
    if (!viewer_username) {
      return res.status(400).json({ error: 'viewer_username is required' });
    }
    viewer_username = String(viewer_username).trim();

    const userResult = await pool.query(
      'SELECT id FROM users WHERE LOWER(TRIM(username)) = LOWER(TRIM($1))',
      [viewer_username]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const viewerId = userResult.rows[0].id;
    if (viewerId === req.userId) {
      return res.status(400).json({ error: 'Cannot share with yourself' });
    }

    // Max 6 check: count non-rejected shares for this owner
    const countResult = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       WHERE s.owner_id = $1 AND ss.status != 'rejected'`,
      [req.userId]
    );
    if (countResult.rows[0].cnt >= 6) {
      return res.status(400).json({ error: 'Maximum of 6 shares reached' });
    }

    const result = await pool.query(
      `INSERT INTO shares (owner_id, viewer_id)
       VALUES ($1, $2)
       ON CONFLICT (owner_id, viewer_id) DO NOTHING
       RETURNING *`,
      [req.userId, viewerId]
    );

    if (result.rows.length === 0) {
      // Row already exists — update status to pending (re-share after rejection)
      const existing = await pool.query(
        'SELECT id FROM shares WHERE owner_id = $1 AND viewer_id = $2',
        [req.userId, viewerId]
      );
      if (existing.rows.length > 0) {
        await pool.query(
          "UPDATE share_status SET status = 'pending' WHERE share_id = $1",
          [existing.rows[0].id]
        );
        const updated = await pool.query(
          `SELECT s.*, ss.status FROM shares s
           LEFT JOIN share_status ss ON ss.share_id = s.id
           WHERE s.id = $1`,
          [existing.rows[0].id]
        );
        return res.status(201).json(updated.rows[0]);
      }
      return res.status(409).json({ error: 'Already sharing with this user' });
    }

    // Insert status row for new share
    await pool.query(
      "INSERT INTO share_status (share_id, status) VALUES ($1, 'pending')",
      [result.rows[0].id]
    );

    res.status(201).json({ ...result.rows[0], status: 'pending' });
  } catch (err) {
    console.error('Create share error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check for new messages across all shares (for notification badge)
router.get('/new-messages', async (req, res) => {
  try {
    const readRow = await pool.query(
      'SELECT last_read_at FROM message_reads WHERE user_id = $1',
      [req.userId]
    );
    const since = readRow.rows[0]?.last_read_at || new Date(0).toISOString();
    const result = await pool.query(
      `SELECT sc.id, sc.share_id, sc.text, sc.created_at, u.username as sender_username
       FROM share_comments sc
       JOIN users u ON sc.sender_id = u.id
       JOIN shares s ON sc.share_id = s.id
       JOIN share_status ss ON ss.share_id = s.id
       WHERE (s.owner_id = $1 OR s.viewer_id = $1)
         AND ss.status = 'accepted'
         AND sc.sender_id != $1
         AND sc.created_at > $2
       ORDER BY sc.created_at DESC
       LIMIT 20`,
      [req.userId, since]
    );
    res.json({ messages: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('New messages check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark messages as read (stores in DB so it persists across devices/logins)
router.post('/mark-messages-read', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO message_reads (user_id, last_read_at) VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_read_at = NOW()`,
      [req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark messages read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get shares seen timestamp for notification badge
router.get('/shares-seen', async (req, res) => {
  try {
    const row = await pool.query(
      'SELECT shares_seen_at FROM message_reads WHERE user_id = $1',
      [req.userId]
    );
    res.json({ seenAt: row.rows[0]?.shares_seen_at || null });
  } catch (err) {
    console.error('Get shares seen error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark shares as seen
router.post('/mark-shares-seen', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO message_reads (user_id, shares_seen_at) VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET shares_seen_at = NOW()`,
      [req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Mark shares seen error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept or reject a pending share (viewer only)
// MUST be defined BEFORE the generic PATCH /:id
router.patch('/:id/respond', async (req, res) => {
  try {
    const { action } = req.body;
    if (!['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'action must be "accepted" or "rejected"' });
    }

    // Verify this share exists and viewer is the current user, and it's pending
    const share = await pool.query(
      `SELECT s.id FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       WHERE s.id = $1 AND s.viewer_id = $2 AND ss.status = 'pending'`,
      [req.params.id, req.userId]
    );
    if (share.rows.length === 0) {
      return res.status(404).json({ error: 'Pending share not found' });
    }

    await pool.query(
      'UPDATE share_status SET status = $1 WHERE share_id = $2',
      [action, req.params.id]
    );

    const result = await pool.query(
      `SELECT s.*, ss.status FROM shares s
       LEFT JOIN share_status ss ON ss.share_id = s.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Respond to share error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle share_planned on/off (owner only)
router.patch('/:id', async (req, res) => {
  try {
    const { share_planned } = req.body;
    const result = await pool.query(
      'UPDATE shares SET share_planned = $1 WHERE id = $2 AND owner_id = $3 RETURNING *',
      [!!share_planned, req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Toggle share_planned error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Revoke access (either party can remove)
router.delete('/:id', async (req, res) => {
  try {
    // Delete status first (we own this table)
    await pool.query('DELETE FROM share_status WHERE share_id = $1', [req.params.id]);

    const result = await pool.query(
      'DELETE FROM shares WHERE id = $1 AND (owner_id = $2 OR viewer_id = $2) RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }
    res.json({ message: 'Share revoked' });
  } catch (err) {
    console.error('Delete share error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// View shared user's meals
router.get('/:userId/meals', async (req, res) => {
  try {
    // Verify the current user has accepted access
    const access = await pool.query(
      `SELECT s.id FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       WHERE s.owner_id = $1 AND s.viewer_id = $2 AND ss.status = 'accepted'`,
      [req.params.userId, req.userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { date } = req.query;
    let query, params;
    if (date) {
      query = `SELECT m.*, u.username FROM meals m JOIN users u ON m.user_id = u.id
               WHERE m.user_id = $1 AND m.logged_at::date = $2 ORDER BY m.logged_at`;
      params = [req.params.userId, date];
    } else {
      query = `SELECT m.*, u.username FROM meals m JOIN users u ON m.user_id = u.id
               WHERE m.user_id = $1 AND m.logged_at::date = CURRENT_DATE ORDER BY m.logged_at`;
      params = [req.params.userId];
    }

    const result = await pool.query(query, params);

    // Also get their goals for context
    const goalsResult = await pool.query(
      'SELECT daily_total FROM calorie_goals WHERE user_id = $1',
      [req.params.userId]
    );

    res.json({
      meals: result.rows,
      goals: goalsResult.rows[0] || { daily_total: 2000 },
    });
  } catch (err) {
    console.error('View shared meals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// View shared user's planned meals
router.get('/:userId/planned-meals', async (req, res) => {
  try {
    // Verify access AND share_planned is enabled
    const access = await pool.query(
      `SELECT s.id, s.share_planned FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       WHERE s.owner_id = $1 AND s.viewer_id = $2 AND ss.status = 'accepted'`,
      [req.params.userId, req.userId]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!access.rows[0].share_planned) {
      return res.status(403).json({ error: 'Planned meals not shared' });
    }

    const { from, to } = req.query;
    let query, params;
    if (from && to) {
      query = `SELECT * FROM planned_meals
               WHERE user_id = $1 AND planned_date >= $2 AND planned_date <= $3
               ORDER BY planned_date, meal_type`;
      params = [req.params.userId, from, to];
    } else if (from) {
      query = `SELECT * FROM planned_meals
               WHERE user_id = $1 AND planned_date = $2
               ORDER BY meal_type`;
      params = [req.params.userId, from];
    } else {
      query = `SELECT * FROM planned_meals
               WHERE user_id = $1 AND planned_date = CURRENT_DATE
               ORDER BY meal_type`;
      params = [req.params.userId];
    }

    const result = await pool.query(query, params);
    res.json({ plannedMeals: result.rows });
  } catch (err) {
    console.error('View shared planned meals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List comments on a share (merges both directions between two users)
router.get('/:shareId/comments', async (req, res) => {
  try {
    // Verify caller is part of this accepted share and get both user IDs
    const share = await pool.query(
      `SELECT s.id, s.owner_id, s.viewer_id FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       WHERE s.id = $1 AND (s.owner_id = $2 OR s.viewer_id = $2) AND ss.status = 'accepted'`,
      [req.params.shareId, req.userId]
    );
    if (share.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Find ALL accepted shares between these two users (both directions)
    const otherUserId = share.rows[0].owner_id === req.userId
      ? share.rows[0].viewer_id : share.rows[0].owner_id;
    const allShares = await pool.query(
      `SELECT s.id FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       WHERE ((s.owner_id = $1 AND s.viewer_id = $2) OR (s.owner_id = $2 AND s.viewer_id = $1))
         AND ss.status = 'accepted'`,
      [req.userId, otherUserId]
    );
    const shareIds = allShares.rows.map(s => s.id);

    const result = await pool.query(
      `SELECT sc.*, u.username as sender_username
       FROM share_comments sc JOIN users u ON sc.sender_id = u.id
       WHERE sc.share_id = ANY($1)
       ORDER BY sc.created_at ASC`,
      [shareIds]
    );
    res.json({ comments: result.rows });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Post a comment on a share
router.post('/:shareId/comments', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    if (containsProfanity(text)) {
      return res.status(400).json({ error: 'Message contains inappropriate language' });
    }

    // Verify caller is part of this accepted share
    const share = await pool.query(
      `SELECT s.id FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       WHERE s.id = $1 AND (s.owner_id = $2 OR s.viewer_id = $2) AND ss.status = 'accepted'`,
      [req.params.shareId, req.userId]
    );
    if (share.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `INSERT INTO share_comments (share_id, sender_id, text)
       VALUES ($1, $2, $3)
       RETURNING *, (SELECT username FROM users WHERE id = $2) as sender_username`,
      [req.params.shareId, req.userId, text.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Post comment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
