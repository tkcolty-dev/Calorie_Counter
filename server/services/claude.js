// GenAI service via VCAP_SERVICES (OpenAI-compatible proxy)
// Falls back to ANTHROPIC_API_KEY + Anthropic SDK for local dev

function getGenAIConfig() {
  if (process.env.VCAP_SERVICES) {
    const vcap = JSON.parse(process.env.VCAP_SERVICES);
    const genai = vcap.genai && vcap.genai[0];
    if (genai) {
      const ep = genai.credentials.endpoint || genai.credentials;
      return {
        apiBase: ep.api_base,
        apiKey: ep.api_key,
        model: 'openai/gpt-oss-120b',
        provider: 'genai',
      };
    }
  }
  // Local dev fallback
  return {
    apiKey: process.env.ANTHROPIC_API_KEY,
    provider: 'anthropic',
  };
}

async function callLLM({ messages, systemPrompt, maxTokens = 1024 }) {
  const config = getGenAIConfig();

  if (config.provider === 'genai') {
    // OpenAI-compatible API
    const allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const res = await fetch(`${config.apiBase}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: allMessages,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  // Anthropic SDK fallback for local dev
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt || undefined,
    messages,
  });
  return response.content[0].text;
}

async function callLLMStream({ messages, systemPrompt, maxTokens = 1024, onChunk }) {
  const config = getGenAIConfig();

  if (config.provider === 'genai') {
    const allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    // Try streaming first, fall back to non-streaming if proxy doesn't support it
    const res = await fetch(`${config.apiBase}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: allMessages,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GenAI API error ${res.status}: ${err}`);
    }

    const contentType = res.headers.get('content-type') || '';

    // If the proxy doesn't actually stream (returns JSON instead of SSE),
    // read the full response and emit it as one chunk
    if (contentType.includes('application/json')) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (text) onChunk(text);
      return text;
    }

    // SSE streaming response
    let full = '';
    let buffer = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        // Handle both "data: {...}" and "data:{...}" (no space)
        let jsonStr;
        if (line.startsWith('data:')) {
          const rest = line.slice(5).trim();
          if (rest === '[DONE]' || !rest) continue;
          jsonStr = rest;
        } else {
          continue;
        }
        try {
          const json = JSON.parse(jsonStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        } catch {}
      }
    }

    // Process any remaining buffer
    if (buffer) {
      for (const line of buffer.split('\n')) {
        let jsonStr;
        if (line.startsWith('data:')) {
          const rest = line.slice(5).trim();
          if (rest === '[DONE]' || !rest) continue;
          jsonStr = rest;
        } else continue;
        try {
          const json = JSON.parse(jsonStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        } catch {}
      }
    }

    return full;
  }

  // Anthropic SDK fallback for local dev
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt || undefined,
    messages,
  });

  let full = '';
  stream.on('text', (text) => {
    full += text;
    onChunk(text);
  });

  await stream.finalMessage();
  return full;
}

async function getSuggestions({ meal_type, remainingCalories, mealBudget, preferences, todaysMeals }) {
  const cuisinePrefs = preferences.filter(p => p.preference_type === 'cuisine').map(p => p.value);
  const dietaryPrefs = preferences.filter(p => p.preference_type === 'dietary').map(p => p.value);
  const favorites = preferences.filter(p => p.preference_type === 'favorite').map(p => p.value);
  const dislikes = preferences.filter(p => p.preference_type === 'dislike').map(p => p.value);

  const mealsDescription = todaysMeals.length > 0
    ? todaysMeals.map(m => `${m.name} (${m.calories} cal) for ${m.meal_type}`).join(', ')
    : 'nothing yet';

  const prompt = `Suggest 3 meal options for ${meal_type}.
Budget: ${mealBudget} calories for this meal, ${remainingCalories} calories remaining for the day.
${cuisinePrefs.length > 0 ? `Cuisine preferences: ${cuisinePrefs.join(', ')}` : ''}
${dietaryPrefs.length > 0 ? `Dietary requirements: ${dietaryPrefs.join(', ')}` : ''}
${favorites.length > 0 ? `Favorite foods: ${favorites.join(', ')}` : ''}
${dislikes.length > 0 ? `Dislikes (avoid these): ${dislikes.join(', ')}` : ''}
Already ate today: ${mealsDescription}.

Use full or half servings only (e.g. "1 cup rice", "2 eggs", "1/2 avocado"). Never suggest odd fractions like 0.7 cups.

Return ONLY a JSON array with exactly 3 objects, each having: name (string), description (string, 1 sentence), calories (number), ingredients (array of strings). No other text.`;

  const text = await callLLM({
    messages: [{ role: 'user', content: prompt }],
  });

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse suggestions from AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

function buildChatPrompt({ goals, todaysMeals, remainingCalories, preferences, plannedMeals, clientDate, clientHour, foodReference, sharedUsers }) {
  const cuisinePrefs = preferences.filter(p => p.preference_type === 'cuisine').map(p => p.value);
  const dietaryPrefs = preferences.filter(p => p.preference_type === 'dietary').map(p => p.value);
  const favorites = preferences.filter(p => p.preference_type === 'favorite').map(p => p.value);
  const dislikes = preferences.filter(p => p.preference_type === 'dislike').map(p => p.value);
  const usualMeals = preferences.filter(p => p.preference_type === 'usual_meal').map(p => p.value);

  const mealsDescription = todaysMeals.length > 0
    ? todaysMeals.map(m => `${m.name} (${m.calories} cal) for ${m.meal_type}`).join(', ')
    : 'nothing yet';

  const plannedDescription = plannedMeals && plannedMeals.length > 0
    ? plannedMeals.map(m => {
        const date = typeof m.planned_date === 'string' ? m.planned_date.split('T')[0] : m.planned_date;
        return `${m.name} (${m.calories} cal) for ${m.meal_type} on ${date}`;
      }).join(', ')
    : 'none';

  const timeLabel = clientHour != null
    ? `${clientHour % 12 || 12}:00 ${clientHour >= 12 ? 'PM' : 'AM'}`
    : null;

  return `You are a friendly nutrition assistant inside a calorie tracking app.
Today's date: ${clientDate || new Date().toISOString().split('T')[0]}${timeLabel ? `\nCurrent time: ${timeLabel}` : ''}

User context:
- Daily calorie goal: ${goals.daily_total} cal${goals.breakfast ? ` (breakfast: ${goals.breakfast}, lunch: ${goals.lunch}, dinner: ${goals.dinner}, snacks: ${goals.snacks})` : ''}
- Calories remaining today: ${remainingCalories} cal
- Already ate today: ${mealsDescription}
- Planned meals (upcoming): ${plannedDescription}
${cuisinePrefs.length > 0 ? `- Cuisine preferences: ${cuisinePrefs.join(', ')}` : ''}
${dietaryPrefs.length > 0 ? `- Dietary requirements: ${dietaryPrefs.join(', ')}` : ''}
${favorites.length > 0 ? `- Favorite foods: ${favorites.join(', ')}` : ''}
${dislikes.length > 0 ? `- Dislikes (avoid these): ${dislikes.join(', ')}` : ''}
${usualMeals.length > 0 ? `- Usual meals:\n${usualMeals.map(m => `  * ${m}`).join('\n')}` : ''}

You can suggest meals in two ways:

1. To log a meal NOW (for today), use a "meal" block:
\`\`\`meal
{"name": "Grilled Chicken Salad", "calories": 420, "meal_type": "lunch", "protein_g": 35, "carbs_g": 12, "fat_g": 18}
\`\`\`

2. To PLAN a meal for a specific date (today or future), use a "planned_meal" block. The planned_date must be YYYY-MM-DD format:
\`\`\`planned_meal
{"name": "Grilled Chicken Salad", "calories": 420, "meal_type": "lunch", "planned_date": "2026-02-24", "protein_g": 35, "carbs_g": 12, "fat_g": 18}
\`\`\`

CRITICAL: When the user asks to "plan meals for tomorrow", "plan my day", "plan meals for [date]", or anything about planning ahead, you MUST include planned_meal blocks for EVERY meal you suggest. Each meal needs its own planned_meal block. Without these blocks the meals won't be saved. Do NOT skip the blocks. Do NOT use meal blocks for future dates.

When planning a full day, plan breakfast, lunch, dinner, and optionally a snack, keeping the total within the daily calorie goal of ${goals.daily_total} cal. Output a planned_meal block for each one. Skip any meal_type that already has a planned meal for that date.

When the user tells you they like or dislike a food (e.g. "I like Cheerios", "I love tacos", "I hate mushrooms"), save it by outputting a preference block:

\`\`\`preference
{"type": "favorite", "value": "Cheerios"}
\`\`\`

Use type "favorite" for likes and "dislike" for dislikes. Acknowledge that you've remembered it. Use the simple food name as the value (e.g. "Cheerios" not "Cheerios cereal for breakfast").

When the user defines a usual/regular meal (e.g. "my usual breakfast is oatmeal and eggs", "I always have a turkey sandwich for lunch"), save it with type "usual_meal":

\`\`\`preference
{"type": "usual_meal", "value": "breakfast: Oatmeal (300 cal) and 2 scrambled eggs (180 cal)"}
\`\`\`

Format the value as "meal_type: item1 (cal) and item2 (cal)". Include calorie estimates.

When the user says "log my usual breakfast" (or lunch/dinner/snack), check their usual meals list above. If found, output meal blocks for each item. If not found, ask what their usual meal is and offer to remember it.

When the user asks "what should I eat?" or similar, consider:
1. Time of day → suggest the appropriate meal type
2. Remaining calorie budget → keep the suggestion within budget
3. What they already ate today → suggest variety
4. Their favorites and preferences → personalize
5. Their usual meals → offer those as quick options if relevant
Be specific with a concrete suggestion and include a meal block so they can log it with one tap.

Keep responses concise and conversational. You can suggest multiple meals in one response. Always respect the user's calorie budget and preferences.

IMPORTANT: When suggesting serving sizes, always use full servings or half servings (e.g. "1 cup", "2 eggs", "1/2 cup", "1.5 servings"). Never suggest odd fractions like 0.7 cups or 1.3 servings. Keep portions practical and realistic.

When the user asks for a recipe, provide it in a recipe block:
\`\`\`recipe
{"name": "Chicken Stir Fry", "servings": 2, "calories_per_serving": 450, "prep_time": "10 min", "cook_time": "15 min", "protein_g": 35, "carbs_g": 40, "fat_g": 12, "ingredients": ["1 lb chicken breast, diced", "2 cups broccoli florets", "1 tbsp soy sauce"], "steps": ["Cut chicken into 1-inch pieces", "Heat oil in a wok over high heat", "Cook chicken 5-6 minutes until golden"]}
\`\`\`
Include accurate calorie and macro estimates. Keep ingredients practical and steps clear and concise.

When the user asks for a grocery list (e.g. "make a grocery list", "what do I need to buy"), look at their planned meals and generate a consolidated grocery list in a grocery_list block:
\`\`\`grocery_list
{"title": "Grocery List for Mon-Fri", "categories": [{"name": "Protein", "items": ["2 lbs chicken breast", "1 dozen eggs"]}, {"name": "Produce", "items": ["3 bananas", "1 head broccoli"]}, {"name": "Pantry", "items": ["1 box pasta", "olive oil"]}]}
\`\`\`
Combine duplicate ingredients across meals (e.g. if two meals need chicken, add up the amounts). Group items by category: Protein, Produce, Dairy, Grains/Pantry, Other. Only include items the user likely needs to buy (skip salt, pepper, water, basic cooking oil).
${sharedUsers && sharedUsers.length > 0 ? `
Shared users (you can log/plan food for them): ${sharedUsers.map(u => u.username).join(', ')}
When the user asks to log or plan food for someone else, include "for_user": "username" in the meal or planned_meal JSON block. Only use usernames from the shared users list above. If the user mentions someone not in the list, let them know you can only log/plan for shared users.` : ''}
${foodReference && foodReference.length > 0 ? `
CALORIE REFERENCE (use these exact values when suggesting these foods):
${foodReference.map(f => {
  let line = `- ${f.name}: ${f.calories_per_serving} cal per ${f.serving_size}`;
  if (f.protein_g != null || f.carbs_g != null || f.fat_g != null) {
    const parts = [];
    if (f.protein_g != null) parts.push(`P:${f.protein_g}g`);
    if (f.carbs_g != null) parts.push(`C:${f.carbs_g}g`);
    if (f.fat_g != null) parts.push(`F:${f.fat_g}g`);
    line += ` (${parts.join(', ')})`;
  }
  return line;
}).join('\n')}

IMPORTANT: Always use the calorie values from this reference when available. These are from our verified food database. If a food is not listed above, use your best estimate but be accurate.` : ''}`;
}

async function chatWithAI({ message, history, ...ctx }) {
  const systemPrompt = buildChatPrompt(ctx);
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  return await callLLM({ messages, systemPrompt, maxTokens: 4096 });
}

async function chatWithAIStream({ message, history, onChunk, ...ctx }) {
  const systemPrompt = buildChatPrompt(ctx);
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  return await callLLMStream({ messages, systemPrompt, maxTokens: 4096, onChunk });
}

async function analyzePhoto(base64Image) {
  const config = getGenAIConfig();
  const prompt = `Look at this photo of food. Identify each food item visible and estimate the calories and macros.

Return ONLY a JSON array of items. Each item: {"name": "food name", "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}

Be practical with portions — estimate realistic serving sizes from what's visible. If unsure, give your best estimate. No other text.`;

  if (config.provider === 'genai') {
    const res = await fetch(`${config.apiBase}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            { type: 'text', text: prompt },
          ],
        }],
        max_tokens: 1024,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GenAI vision error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const text = data.choices[0].message.content;
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Failed to parse photo analysis');
    return JSON.parse(match[0]);
  }

  // Anthropic SDK fallback
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  const text = response.content[0].text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Failed to parse photo analysis');
  return JSON.parse(match[0]);
}

async function parseVoiceInput({ transcript, foodReference, defaultMealType }) {
  const refLines = foodReference && foodReference.length > 0
    ? foodReference.map(f => {
        let line = `- ${f.name}: ${f.calories_per_serving} cal per ${f.serving_size}`;
        const parts = [];
        if (f.protein_g != null) parts.push(`P:${f.protein_g}g`);
        if (f.carbs_g != null) parts.push(`C:${f.carbs_g}g`);
        if (f.fat_g != null) parts.push(`F:${f.fat_g}g`);
        if (parts.length) line += ` (${parts.join(', ')})`;
        return line;
      }).join('\n')
    : '';

  const prompt = `Parse this voice input into individual food items with calorie and macro estimates.

Voice transcript: "${transcript}"

${refLines ? `CALORIE REFERENCE (use these exact values when available):\n${refLines}\n` : ''}
Return ONLY a JSON array. Each item: {"name": "food name", "calories": number, "meal_type": "${defaultMealType}", "protein_g": number, "carbs_g": number, "fat_g": number}

Rules:
- Split into individual food items (e.g. "two eggs and toast" → 2 items)
- Honor quantities mentioned (e.g. "two eggs" = 2 eggs worth of calories)
- Use reference data calories when available, otherwise give your best estimate
- Use practical serving sizes
- All meal_type values should be "${defaultMealType}"
- Return empty array [] if no food items can be identified`;

  const text = await callLLM({ messages: [{ role: 'user', content: prompt }] });
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

module.exports = { getSuggestions, chatWithAI, chatWithAIStream, analyzePhoto, parseVoiceInput, callLLMStream, getGenAIConfig };
