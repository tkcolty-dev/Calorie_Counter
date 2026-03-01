import { useState } from 'react';

function formatTime(logged_at) {
  if (!logged_at) return '';
  const d = new Date(logged_at);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const typeColors = {
  breakfast: '#f59e0b',
  lunch: '#3b82f6',
  dinner: '#8b5cf6',
  snack: '#10b981',
};

const typeOrder = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function MealTable({ meals, onDelete }) {
  const [collapsed, setCollapsed] = useState({});

  const mealsByType = {};
  for (const type of typeOrder) {
    const items = meals.filter(m => m.meal_type === type);
    if (items.length > 0) mealsByType[type] = items;
  }

  const toggle = (type) => {
    setCollapsed(prev => ({ ...prev, [type]: !prev[type] }));
  };

  if (Object.keys(mealsByType).length === 0) {
    return null;
  }

  return (
    <div>
      {typeOrder.map(type => {
        const items = mealsByType[type];
        if (!items) return null;
        const subtotal = items.reduce((s, m) => s + m.calories, 0);
        const isCollapsed = collapsed[type];
        const color = typeColors[type];

        return (
          <div key={type} className="meal-table-section" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="meal-table-header" onClick={() => toggle(type)}>
              <div className="meal-table-header-left">
                <span className="meal-table-header-label">{type}</span>
                <span className="meal-table-header-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {items.length > 1 && <span className="meal-table-header-cal">{subtotal} cal</span>}
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>&#9662;</span>
              </div>
            </div>
            {!isCollapsed && (
              <div className="meal-table-rows">
                {items.map(meal => (
                  <div key={meal.id} className="meal-table-item">
                    <div className="meal-table-row">
                      <div className="meal-table-row-left">
                        <span className="meal-table-row-name">{meal.name}</span>
                        <div className="meal-table-row-meta">
                          <span>{formatTime(meal.logged_at)}</span>
                          {(meal.protein_g != null || meal.carbs_g != null || meal.fat_g != null) && (
                            <>
                              <span className="meal-meta-sep">&middot;</span>
                              {meal.protein_g != null && <span>P:{meal.protein_g}g</span>}
                              {meal.carbs_g != null && <span>C:{meal.carbs_g}g</span>}
                              {meal.fat_g != null && <span>F:{meal.fat_g}g</span>}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="meal-table-row-right">
                        <span className="meal-table-row-cal">{meal.calories}</span>
                        <span className="meal-table-row-cal-unit">cal</span>
                      </div>
                    </div>
                    {onDelete && (
                      <button className="meal-table-row-delete" onClick={() => onDelete(meal.id)}>
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
