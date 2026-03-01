const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { chatWithAI, chatWithAIStream } = require('../services/claude');
const { searchLocalDB, searchOpenFoodFacts } = require('../services/foodSearch');
const { containsProfanity } = require('../utils/profanityFilter');

const router = express.Router();
router.use(auth);

router.post('/', async (req, res) => {
  try {
    const { message, history, today } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (containsProfanity(message)) {
      return res.status(400).json({ error: 'Message contains inappropriate language' });
    }

    const clientDate = today || new Date().toISOString().split('T')[0];

    // Gather user context
    const [goalsResult, mealsResult, prefsResult, plannedResult, sharesResult] = await Promise.all([
      pool.query('SELECT * FROM calorie_goals WHERE user_id = $1', [req.userId]),
      pool.query(
        `SELECT meal_type, name, calories FROM meals
         WHERE user_id = $1 AND logged_at::date = $2::date`,
        [req.userId, clientDate]
      ),
      pool.query(
        'SELECT preference_type, value FROM food_preferences WHERE user_id = $1',
        [req.userId]
      ),
      pool.query(
        `SELECT meal_type, name, calories, planned_date FROM planned_meals
         WHERE user_id = $1 AND planned_date >= $2::date
         ORDER BY planned_date, created_at`,
        [req.userId, clientDate]
      ),
      // Accepted shares: all shared users in both directions
      pool.query(
        `SELECT u.id as user_id, u.username
         FROM shares s
         JOIN share_status ss ON ss.share_id = s.id
         JOIN users u ON u.id = CASE WHEN s.owner_id = $1 THEN s.viewer_id ELSE s.owner_id END
         WHERE (s.owner_id = $1 OR s.viewer_id = $1) AND ss.status = 'accepted'`,
        [req.userId]
      ),
    ]);

    const goals = goalsResult.rows[0] || { daily_total: 2000 };
    const todaysMeals = mealsResult.rows;
    const caloriesConsumed = todaysMeals.reduce((sum, m) => sum + m.calories, 0);
    const remainingCalories = goals.daily_total - caloriesConsumed;
    const preferences = prefsResult.rows;
    const plannedMeals = plannedResult.rows;
    const sharedUsers = sharesResult.rows;

    // Look up calorie data for foods mentioned in the message
    const foodWords = message.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    // Extract 2-3 word food phrases from the message
    const searchTerms = new Set();
    const fullMsg = message.toLowerCase();
    // Try the full message as a search (for short messages like "pizza")
    if (fullMsg.length < 40) searchTerms.add(fullMsg.trim());
    // Also try individual meaningful words
    const skipWords = new Set(['the','and','for','can','you','what','how','plan','meal','meals','tomorrow','today','should','about','some','with','that','this','have','want','like','need','make','good','help','give','tell']);
    for (const w of foodWords) {
      if (!skipWords.has(w)) searchTerms.add(w);
    }

    let foodReference = [];
    try {
      const searches = [...searchTerms].slice(0, 3);
      // Search both local DB and Open Food Facts for branded products
      const [localResults, offResults] = await Promise.all([
        Promise.all(searches.map(t => searchLocalDB(t).catch(() => []))),
        Promise.all(searches.map(t => searchOpenFoodFacts(t).catch(() => []))),
      ]);
      const seen = new Set();
      // Add local DB results first
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
      // Add branded Open Food Facts results
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
      // Limit to avoid making the prompt too long
      foodReference = foodReference.slice(0, 20);
    } catch {}

    let reply = await chatWithAI({
      message,
      history: history || [],
      goals,
      todaysMeals,
      remainingCalories,
      preferences,
      plannedMeals,
      clientDate,
      foodReference,
      sharedUsers,
    });

    if (!reply) {
      return res.status(500).json({ error: 'AI returned an empty response' });
    }

    // Resolve for_user in meal blocks → inject for_user_id/for_user_name for frontend
    const mealBlockRegex = /```meal\s*\n([\s\S]*?)```/g;
    reply = reply.replace(mealBlockRegex, (fullMatch, jsonStr) => {
      try {
        const meal = JSON.parse(jsonStr.trim());
        if (meal.for_user) {
          const target = sharedUsers.find(u => u.username.toLowerCase() === meal.for_user.toLowerCase());
          if (target) {
            meal.for_user_id = target.user_id;
            meal.for_user_name = target.username;
          }
          delete meal.for_user;
          return '```meal\n' + JSON.stringify(meal) + '\n```';
        }
        return fullMatch;
      } catch {
        return fullMatch;
      }
    });

    // Parse and save any preference blocks from the AI response
    const prefRegex = /```preference\s*\n([\s\S]*?)```/g;
    let prefMatch;
    const learnedPrefs = [];
    while ((prefMatch = prefRegex.exec(reply)) !== null) {
      try {
        const pref = JSON.parse(prefMatch[1].trim());
        if (pref.type && pref.value && ['favorite', 'dislike', 'usual_meal'].includes(pref.type)) {
          // For usual_meal, match on meal type prefix (e.g. "breakfast:")
          const matchQuery = pref.type === 'usual_meal'
            ? 'SELECT id FROM food_preferences WHERE user_id = $1 AND preference_type = $2 AND LOWER(value) LIKE LOWER($3)'
            : 'SELECT id FROM food_preferences WHERE user_id = $1 AND preference_type = $2 AND LOWER(value) = LOWER($3)';
          const matchVal = pref.type === 'usual_meal'
            ? pref.value.split(':')[0].trim() + ':%'
            : pref.value;
          const existing = await pool.query(matchQuery, [req.userId, pref.type, matchVal]);
          if (existing.rows.length > 0 && pref.type === 'usual_meal') {
            // Update existing usual meal
            await pool.query(
              'UPDATE food_preferences SET value = $1 WHERE id = $2',
              [pref.value, existing.rows[0].id]
            );
            learnedPrefs.push(pref);
          } else if (existing.rows.length === 0) {
            await pool.query(
              'INSERT INTO food_preferences (user_id, preference_type, value) VALUES ($1, $2, $3)',
              [req.userId, pref.type, pref.value]
            );
            learnedPrefs.push(pref);
          }
        }
      } catch {}
    }

    // Parse and save any planned_meal blocks from the AI response
    const plannedRegex = /```planned_meal\s*\n([\s\S]*?)```/g;
    let plannedMatch;
    const savedPlans = [];
    while ((plannedMatch = plannedRegex.exec(reply)) !== null) {
      try {
        const plan = JSON.parse(plannedMatch[1].trim());
        if (plan.name && plan.calories && plan.meal_type && plan.planned_date) {
          const validTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
          if (validTypes.includes(plan.meal_type)) {
            // Resolve target user for shared-user planned meals
            let planTargetUserId = req.userId;
            if (plan.for_user) {
              const target = sharedUsers.find(u => u.username.toLowerCase() === plan.for_user.toLowerCase());
              if (target) {
                planTargetUserId = target.user_id;
              }
            }
            // Skip if a planned meal with same name+date already exists
            const existing = await pool.query(
              `SELECT id FROM planned_meals WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND planned_date = $3`,
              [planTargetUserId, plan.name, plan.planned_date]
            );
            if (existing.rows.length === 0) {
              const inserted = await pool.query(
                `INSERT INTO planned_meals (user_id, meal_type, name, calories, notes, planned_date, protein_g, carbs_g, fat_g)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [planTargetUserId, plan.meal_type, plan.name, parseInt(plan.calories), plan.notes || null, plan.planned_date, plan.protein_g || null, plan.carbs_g || null, plan.fat_g || null]
              );
              savedPlans.push(inserted.rows[0]);
            }
          }
        }
      } catch {}
    }

    // Replace preference blocks with readable text
    reply = reply.replace(/```preference\s*\n([\s\S]*?)```\s*/g, (_, jsonStr) => {
      try {
        const p = JSON.parse(jsonStr.trim());
        const label = p.type === 'dislike' ? 'Dislike' : p.type === 'usual_meal' ? 'Usual meal' : 'Favorite';
        return `**${label}:** ${p.value}\n`;
      } catch { return ''; }
    }).trim();
    reply = reply.replace(/```planned_meal\s*\n[\s\S]*?```\s*/g, '').trim();

    res.json({ reply, learnedPreferences: learnedPrefs, savedPlans });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

// Helper: gather user context + food reference for chat
async function gatherChatContext(userId, message, today) {
  const clientDate = today || new Date().toISOString().split('T')[0];

  const foodWords = message.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const searchTerms = new Set();
  const fullMsg = message.toLowerCase();
  if (fullMsg.length < 40) searchTerms.add(fullMsg.trim());
  const skipWords = new Set(['the','and','for','can','you','what','how','plan','meal','meals','tomorrow','today','should','about','some','with','that','this','have','want','like','need','make','good','help','give','tell']);
  for (const w of foodWords) {
    if (!skipWords.has(w)) searchTerms.add(w);
  }
  const searches = [...searchTerms].slice(0, 3);

  // Run DB context + food searches all in parallel
  const [goalsResult, mealsResult, prefsResult, plannedResult, sharesResult, localResults, offResults] = await Promise.all([
    pool.query('SELECT * FROM calorie_goals WHERE user_id = $1', [userId]),
    pool.query('SELECT meal_type, name, calories FROM meals WHERE user_id = $1 AND logged_at::date = $2::date', [userId, clientDate]),
    pool.query('SELECT preference_type, value FROM food_preferences WHERE user_id = $1', [userId]),
    pool.query('SELECT meal_type, name, calories, planned_date FROM planned_meals WHERE user_id = $1 AND planned_date >= $2::date ORDER BY planned_date, created_at', [userId, clientDate]),
    pool.query(
      `SELECT u.id as user_id, u.username FROM shares s
       JOIN share_status ss ON ss.share_id = s.id
       JOIN users u ON u.id = CASE WHEN s.owner_id = $1 THEN s.viewer_id ELSE s.owner_id END
       WHERE (s.owner_id = $1 OR s.viewer_id = $1) AND ss.status = 'accepted'`, [userId]),
    Promise.all(searches.map(t => searchLocalDB(t).catch(() => []))),
    Promise.all(searches.map(t => searchOpenFoodFacts(t).catch(() => []))),
  ]);

  const goals = goalsResult.rows[0] || { daily_total: 2000 };
  const todaysMeals = mealsResult.rows;
  const caloriesConsumed = todaysMeals.reduce((sum, m) => sum + m.calories, 0);
  const remainingCalories = goals.daily_total - caloriesConsumed;
  const sharedUsers = sharesResult.rows;

  let foodReference = [];
  const seen = new Set();
  for (const rows of localResults) {
    for (const r of rows) {
      const key = r.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        foodReference.push({ name: r.name, calories_per_serving: r.calories_per_serving, serving_size: r.serving_size || '1 serving', protein_g: r.protein_g || null, carbs_g: r.carbs_g || null, fat_g: r.fat_g || null });
      }
    }
  }
  for (const rows of offResults) {
    for (const r of rows) {
      const label = r.brand ? `${r.name} (${r.brand})` : r.name;
      const key = label.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        foodReference.push({ name: label, calories_per_serving: r.calories_per_serving, serving_size: r.serving_size || '1 serving', protein_g: r.protein_g || null, carbs_g: r.carbs_g || null, fat_g: r.fat_g || null });
      }
    }
  }
  foodReference = foodReference.slice(0, 20);

  return { goals, todaysMeals, remainingCalories, preferences: prefsResult.rows, plannedMeals: plannedResult.rows, clientDate, foodReference, sharedUsers };
}

// Post-process AI reply: save preferences, planned meals, resolve for_user
async function postProcessReply(reply, userId, sharedUsers) {
  // Resolve for_user in meal blocks
  const mealBlockRegex = /```meal\s*\n([\s\S]*?)```/g;
  reply = reply.replace(mealBlockRegex, (fullMatch, jsonStr) => {
    try {
      const meal = JSON.parse(jsonStr.trim());
      if (meal.for_user) {
        const target = sharedUsers.find(u => u.username.toLowerCase() === meal.for_user.toLowerCase());
        if (target) { meal.for_user_id = target.user_id; meal.for_user_name = target.username; }
        delete meal.for_user;
        return '```meal\n' + JSON.stringify(meal) + '\n```';
      }
      return fullMatch;
    } catch { return fullMatch; }
  });

  // Save preference blocks
  const prefRegex = /```preference\s*\n([\s\S]*?)```/g;
  let prefMatch;
  const learnedPrefs = [];
  while ((prefMatch = prefRegex.exec(reply)) !== null) {
    try {
      const pref = JSON.parse(prefMatch[1].trim());
      if (pref.type && pref.value && ['favorite', 'dislike', 'usual_meal'].includes(pref.type)) {
        const matchQuery = pref.type === 'usual_meal'
          ? 'SELECT id FROM food_preferences WHERE user_id = $1 AND preference_type = $2 AND LOWER(value) LIKE LOWER($3)'
          : 'SELECT id FROM food_preferences WHERE user_id = $1 AND preference_type = $2 AND LOWER(value) = LOWER($3)';
        const matchVal = pref.type === 'usual_meal' ? pref.value.split(':')[0].trim() + ':%' : pref.value;
        const existing = await pool.query(matchQuery, [userId, pref.type, matchVal]);
        if (existing.rows.length > 0 && pref.type === 'usual_meal') {
          await pool.query('UPDATE food_preferences SET value = $1 WHERE id = $2', [pref.value, existing.rows[0].id]);
          learnedPrefs.push(pref);
        } else if (existing.rows.length === 0) {
          await pool.query('INSERT INTO food_preferences (user_id, preference_type, value) VALUES ($1, $2, $3)', [userId, pref.type, pref.value]);
          learnedPrefs.push(pref);
        }
      }
    } catch {}
  }

  // Save planned_meal blocks
  const plannedRegex = /```planned_meal\s*\n([\s\S]*?)```/g;
  let plannedMatch;
  const savedPlans = [];
  while ((plannedMatch = plannedRegex.exec(reply)) !== null) {
    try {
      const plan = JSON.parse(plannedMatch[1].trim());
      if (plan.name && plan.calories && plan.meal_type && plan.planned_date) {
        const validTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
        if (validTypes.includes(plan.meal_type)) {
          let planTargetUserId = userId;
          if (plan.for_user) {
            const target = sharedUsers.find(u => u.username.toLowerCase() === plan.for_user.toLowerCase());
            if (target) planTargetUserId = target.user_id;
          }
          const existing = await pool.query('SELECT id FROM planned_meals WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND planned_date = $3', [planTargetUserId, plan.name, plan.planned_date]);
          if (existing.rows.length === 0) {
            const inserted = await pool.query(
              'INSERT INTO planned_meals (user_id, meal_type, name, calories, notes, planned_date, protein_g, carbs_g, fat_g) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
              [planTargetUserId, plan.meal_type, plan.name, parseInt(plan.calories), plan.notes || null, plan.planned_date, plan.protein_g || null, plan.carbs_g || null, plan.fat_g || null]
            );
            savedPlans.push(inserted.rows[0]);
          }
        }
      }
    } catch {}
  }

  // Replace preference blocks with readable text
  reply = reply.replace(/```preference\s*\n([\s\S]*?)```\s*/g, (_, jsonStr) => {
    try {
      const p = JSON.parse(jsonStr.trim());
      const label = p.type === 'dislike' ? 'Dislike' : p.type === 'usual_meal' ? 'Usual meal' : 'Favorite';
      return `**${label}:** ${p.value}\n`;
    } catch { return ''; }
  }).trim();
  reply = reply.replace(/```planned_meal\s*\n[\s\S]*?```\s*/g, '').trim();

  return { reply, learnedPreferences: learnedPrefs, savedPlans };
}

// Streaming chat endpoint
router.post('/stream', async (req, res) => {
  try {
    const { message, history, today, hour } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    if (containsProfanity(message)) return res.status(400).json({ error: 'Message contains inappropriate language' });

    const ctx = await gatherChatContext(req.userId, message, today);
    if (hour != null) ctx.clientHour = hour;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const fullReply = await chatWithAIStream({
      message,
      history: history || [],
      ...ctx,
      onChunk: (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
    });

    // Post-process the full reply
    const result = await postProcessReply(fullReply, req.userId, ctx.sharedUsers);
    res.write(`data: ${JSON.stringify({ done: true, ...result })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Chat stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to get AI response' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
