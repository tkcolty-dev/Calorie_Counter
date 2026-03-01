export default function PlannedMealsList({ plannedMeals, onLog, onDelete, canLog }) {
  if (plannedMeals.length === 0) return null;

  const totalPlanned = plannedMeals.reduce((sum, m) => sum + m.calories, 0);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Planned Meals</h3>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          {totalPlanned} cal planned
        </span>
      </div>
      {plannedMeals.map((meal) => (
        <div key={meal.id} className="planned-meal-item">
          {canLog ? (
            <button
              className="planned-meal-check"
              onClick={() => onLog(meal)}
              title="Mark as consumed"
            >
              &#x2713;
            </button>
          ) : (
            <span className="planned-meal-pending" title="Available on the planned day">&#x25CB;</span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {meal.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              {meal.meal_type} &middot; {meal.calories} cal
              {meal.planned_by_username && <span style={{ marginLeft: '0.25rem', color: 'var(--color-primary)' }}>by {meal.planned_by_username}</span>}
              {meal.recurrence && (
                <span title={`Repeats ${meal.recurrence}`} style={{ marginLeft: '0.35rem' }}>
                  &#x1F501;
                </span>
              )}
            </div>
          </div>
          <button
            className="planned-meal-delete"
            onClick={() => onDelete(meal.id)}
            title="Remove"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
