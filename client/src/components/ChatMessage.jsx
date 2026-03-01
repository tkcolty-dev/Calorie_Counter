import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

function parseBlocks(text) {
  const parts = [];
  const regex = /```meal\s*\n([\s\S]*?)```|```recipe\s*\n([\s\S]*?)```|```grocery_list\s*\n([\s\S]*?)```|---PLANNED:(.*?):(.*?):([\s\S]*?)(?=\n\n|$)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      try {
        parts.push({ type: 'meal', content: JSON.parse(match[1].trim()) });
      } catch {
        parts.push({ type: 'text', content: match[0] });
      }
    } else if (match[2] !== undefined) {
      try {
        parts.push({ type: 'recipe', content: JSON.parse(match[2].trim()) });
      } catch {
        parts.push({ type: 'text', content: match[0] });
      }
    } else if (match[3] !== undefined) {
      try {
        parts.push({ type: 'grocery_list', content: JSON.parse(match[3].trim()) });
      } catch {
        parts.push({ type: 'text', content: match[0] });
      }
    } else if (match[4] !== undefined) {
      parts.push({
        type: 'planned',
        content: { date: match[4], totalCal: match[5], items: match[6].trim() },
      });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}

function MealCard({ meal }) {
  const queryClient = useQueryClient();

  const logMeal = useMutation({
    mutationFn: () => {
      const n = new Date();
      const localISO = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
      return api.post('/meals', {
        meal_type: meal.meal_type || 'lunch',
        name: meal.name,
        calories: meal.calories,
        logged_at: localISO,
        protein_g: meal.protein_g || undefined,
        carbs_g: meal.carbs_g || undefined,
        fat_g: meal.fat_g || undefined,
        for_user_id: meal.for_user_id || undefined,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meals'] }),
  });

  return (
    <div className="chat-meal-card">
      <div className="chat-meal-card-info">
        <div className="chat-meal-card-name">{meal.name}</div>
        <div className="chat-meal-card-cal">
          {meal.calories} cal &middot; {meal.meal_type || 'lunch'}
          {(meal.protein_g || meal.carbs_g || meal.fat_g) && (
            <span style={{ marginLeft: '0.5rem' }}>
              {meal.protein_g ? `P:${meal.protein_g}g ` : ''}{meal.carbs_g ? `C:${meal.carbs_g}g ` : ''}{meal.fat_g ? `F:${meal.fat_g}g` : ''}
            </span>
          )}
        </div>
      </div>
      <button
        className="btn btn-primary"
        style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
        onClick={() => logMeal.mutate()}
        disabled={logMeal.isPending || logMeal.isSuccess}
      >
        {logMeal.isSuccess
          ? (meal.for_user_name ? `Logged for ${meal.for_user_name}` : 'Logged')
          : logMeal.isPending ? '...'
          : (meal.for_user_name ? `Log for ${meal.for_user_name}` : 'Log this')}
      </button>
    </div>
  );
}

function RecipeCard({ recipe }) {
  return (
    <div className="chat-recipe-card">
      <div className="chat-recipe-header">
        <span className="chat-recipe-badge">Recipe</span>
        <span className="chat-recipe-name">{recipe.name}</span>
      </div>
      <div className="chat-recipe-meta">
        {recipe.servings && <span>{recipe.servings} servings</span>}
        {recipe.calories_per_serving && <span>{recipe.calories_per_serving} cal/serving</span>}
        {recipe.prep_time && <span>Prep: {recipe.prep_time}</span>}
        {recipe.cook_time && <span>Cook: {recipe.cook_time}</span>}
      </div>
      {(recipe.protein_g || recipe.carbs_g || recipe.fat_g) && (
        <div className="chat-recipe-macros">
          {recipe.protein_g ? `P:${recipe.protein_g}g ` : ''}{recipe.carbs_g ? `C:${recipe.carbs_g}g ` : ''}{recipe.fat_g ? `F:${recipe.fat_g}g` : ''}
        </div>
      )}
      <div className="chat-recipe-section">
        <div className="chat-recipe-section-title">Ingredients</div>
        <ul className="chat-recipe-ingredients">
          {recipe.ingredients?.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </div>
      <div className="chat-recipe-section">
        <div className="chat-recipe-section-title">Steps</div>
        <ol className="chat-recipe-steps">
          {recipe.steps?.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      </div>
    </div>
  );
}

function GroceryListCard({ list }) {
  return (
    <div className="chat-grocery-card">
      <div className="chat-grocery-header">
        <span className="chat-grocery-badge">Grocery List</span>
        <span className="chat-grocery-title">{list.title}</span>
      </div>
      {list.categories?.map((cat, i) => (
        <div key={i} className="chat-grocery-category">
          <div className="chat-grocery-category-name">{cat.name}</div>
          <ul className="chat-grocery-items">
            {cat.items?.map((item, j) => <li key={j}>{item}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PlannedCard({ plan }) {
  return (
    <div className="chat-planned-card">
      <div className="chat-planned-card-header">
        <span className="chat-planned-badge">Planned</span>
        <span className="chat-planned-date">{plan.date}</span>
        <span className="chat-planned-total">{plan.totalCal} cal</span>
      </div>
      <div className="chat-planned-card-items">
        {plan.items.split('\n').map((item, i) => (
          <div key={i} className="chat-planned-card-item">{item}</div>
        ))}
      </div>
    </div>
  );
}

// Strip ALL code blocks during streaming — cards appear after streaming ends
function cleanStreamingText(text) {
  // Remove all complete code blocks (meal, recipe, grocery_list, planned_meal, preference)
  let cleaned = text.replace(/```(?:meal|recipe|grocery_list|planned_meal|preference)\s*\n[\s\S]*?```/g, '');
  // Remove any incomplete code block still being typed (no closing ```)
  cleaned = cleaned.replace(/```(?:meal|recipe|grocery_list|planned_meal|preference)\s*\n[\s\S]*$/g, '');
  // Remove ---PLANNED: lines
  cleaned = cleaned.replace(/---PLANNED:[\s\S]*?(?=\n\n|$)/g, '');
  // Collapse multiple blank lines into one
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

export default function ChatMessage({ message, isStreaming }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return <div className="chat-bubble user">{message.content}</div>;
  }

  // During streaming, render plain text without parsing blocks (avoids flicker)
  if (isStreaming) {
    const cleaned = cleanStreamingText(message.content);
    return (
      <div className="chat-bubble assistant">
        <span style={{ whiteSpace: 'pre-wrap' }}>{cleaned}</span>
        <span className="chat-typing-cursor" />
      </div>
    );
  }

  const parts = parseBlocks(message.content);

  return (
    <div className="chat-bubble assistant">
      {parts.map((part, i) =>
        part.type === 'meal' ? (
          <MealCard key={i} meal={part.content} />
        ) : part.type === 'recipe' ? (
          <RecipeCard key={i} recipe={part.content} />
        ) : part.type === 'grocery_list' ? (
          <GroceryListCard key={i} list={part.content} />
        ) : part.type === 'planned' ? (
          <PlannedCard key={i} plan={part.content} />
        ) : (
          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part.content.trim()}</span>
        )
      )}
    </div>
  );
}
