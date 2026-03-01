const typeColors = {
  breakfast: '#f59e0b',
  lunch: '#3b82f6',
  dinner: '#8b5cf6',
  snack: '#10b981',
};

function formatTime(logged_at) {
  if (!logged_at) return '';
  // logged_at is local time stored as UTC — use UTC hours/minutes to get the original local time
  const d = new Date(logged_at);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function MealCard({ meal, onDelete }) {
  const color = typeColors[meal.meal_type] || '#64748b';
  const time = formatTime(meal.logged_at);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1rem',
        borderLeft: `3px solid ${color}`,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--color-border)',
        borderLeftWidth: 3,
        borderLeftColor: color,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{meal.name}</span>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color,
              background: `${color}15`,
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            {meal.meal_type}
          </span>
        </div>
        {meal.notes && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {meal.notes}
          </div>
        )}
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
          {time}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>{meal.calories} cal</span>
        {onDelete && (
          <button
            onClick={() => onDelete(meal.id)}
            className="btn btn-danger"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
