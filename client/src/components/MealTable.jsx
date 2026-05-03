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

const numOrEmpty = (v) => (v === '' || v == null ? '' : String(v));

function EditMealForm({ meal, onCancel, onSave }) {
  const [draft, setDraft] = useState({
    name: meal.name || '',
    meal_type: meal.meal_type || 'snack',
    calories: numOrEmpty(meal.calories),
    protein_g: numOrEmpty(meal.protein_g),
    carbs_g: numOrEmpty(meal.carbs_g),
    fat_g: numOrEmpty(meal.fat_g),
  });

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const handleSave = (e) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const cals = parseFloat(draft.calories);
    if (!Number.isFinite(cals) || cals < 0) return;
    const num = (v) => (v === '' || v == null ? null : parseFloat(v));
    onSave({
      name: draft.name.trim(),
      meal_type: draft.meal_type,
      calories: Math.round(cals),
      protein_g: num(draft.protein_g),
      carbs_g: num(draft.carbs_g),
      fat_g: num(draft.fat_g),
    });
  };

  return (
    <form onSubmit={handleSave} className="meal-edit-form">
      <div className="meal-edit-row">
        <input
          type="text"
          value={draft.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Name"
          autoFocus
          className="meal-edit-input"
          style={{ flex: 1 }}
          required
        />
      </div>
      <div className="meal-edit-row">
        <select
          value={draft.meal_type}
          onChange={e => set('meal_type', e.target.value)}
          className="meal-edit-input"
          style={{ flex: 1 }}
        >
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
        <input
          type="number"
          inputMode="numeric"
          value={draft.calories}
          onChange={e => set('calories', e.target.value)}
          placeholder="Cal"
          className="meal-edit-input"
          style={{ width: 80 }}
          min="0"
          step="1"
          required
        />
      </div>
      <div className="meal-edit-row">
        <input
          type="number"
          inputMode="decimal"
          value={draft.protein_g}
          onChange={e => set('protein_g', e.target.value)}
          placeholder="P (g)"
          className="meal-edit-input"
          style={{ flex: 1 }}
          min="0"
          step="0.1"
        />
        <input
          type="number"
          inputMode="decimal"
          value={draft.carbs_g}
          onChange={e => set('carbs_g', e.target.value)}
          placeholder="C (g)"
          className="meal-edit-input"
          style={{ flex: 1 }}
          min="0"
          step="0.1"
        />
        <input
          type="number"
          inputMode="decimal"
          value={draft.fat_g}
          onChange={e => set('fat_g', e.target.value)}
          placeholder="F (g)"
          className="meal-edit-input"
          style={{ flex: 1 }}
          min="0"
          step="0.1"
        />
      </div>
      <div className="meal-edit-actions">
        <button type="button" className="btn btn-secondary meal-edit-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary meal-edit-btn">
          Save
        </button>
      </div>
    </form>
  );
}

export default function MealTable({ meals, onDelete, onEdit }) {
  // Default: every meal-type section starts collapsed; user taps to expand.
  const [collapsed, setCollapsed] = useState(() => ({
    breakfast: true, lunch: true, dinner: true, snack: true,
  }));
  const [editingId, setEditingId] = useState(null);

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
                <span className="meal-table-header-cal">{subtotal} cal</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>&#9662;</span>
              </div>
            </div>
            <div className={`meal-table-rows-anim${isCollapsed ? '' : ' open'}`}>
              <div className="meal-table-rows">
                {items.map(meal => {
                  const isEditing = editingId === meal.id;
                  if (isEditing && onEdit) {
                    return (
                      <div key={meal.id} className="meal-table-item meal-table-item-editing">
                        <EditMealForm
                          meal={meal}
                          onCancel={() => setEditingId(null)}
                          onSave={(updates) => {
                            onEdit(meal.id, updates);
                            setEditingId(null);
                          }}
                        />
                      </div>
                    );
                  }
                  return (
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
                      <div className="meal-table-row-actions">
                        {onEdit && (
                          <button
                            className="meal-table-row-edit"
                            onClick={() => setEditingId(meal.id)}
                            aria-label={`Edit ${meal.name}`}
                            title="Edit"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9"/>
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                            </svg>
                          </button>
                        )}
                        {onDelete && (
                          <button
                            className="meal-table-row-delete"
                            onClick={() => onDelete(meal.id)}
                            aria-label={`Delete ${meal.name}`}
                            title="Delete"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
