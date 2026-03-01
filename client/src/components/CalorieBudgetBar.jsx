const barContainerStyle = {
  background: 'var(--color-border)',
  borderRadius: 8,
  height: 14,
  overflow: 'hidden',
  position: 'relative',
};

const macroBarContainerStyle = {
  background: 'var(--color-border)',
  borderRadius: 4,
  height: 6,
  overflow: 'hidden',
  flex: 1,
};

const macroColors = {
  protein: '#3b82f6',
  carbs: '#f59e0b',
  fat: '#ef4444',
};

function MacroBar({ label, current, goal, color }) {
  if (!goal) return null;
  const pct = Math.min((current / goal) * 100, 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color, minWidth: 14, textAlign: 'center' }}>{label}</span>
      <div style={macroBarContainerStyle}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', minWidth: 52, textAlign: 'right' }}>
        {Math.round(current)}/{goal}g
      </span>
    </div>
  );
}

export default function CalorieBudgetBar({ consumed, goal, macros, macroGoals }) {
  const pct = goal > 0 ? Math.min((consumed / goal) * 100, 100) : 0;
  const remaining = Math.max(goal - consumed, 0);
  const isOver = consumed > goal;

  const barColor = isOver
    ? 'var(--color-danger)'
    : pct > 80
      ? 'var(--color-warning)'
      : 'var(--color-success)';

  const showMacros = macros && macroGoals && (macroGoals.protein || macroGoals.carbs || macroGoals.fat);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.75rem' }}>
        <span style={{ fontWeight: 600 }}>{consumed.toLocaleString()} cal</span>
        <span style={{ color: isOver ? 'var(--color-danger)' : 'var(--color-text-secondary)', fontSize: '0.7rem' }}>
          {isOver ? `${(consumed - goal).toLocaleString()} over` : `${remaining.toLocaleString()} left`} / {goal.toLocaleString()}
        </span>
      </div>
      <div style={barContainerStyle}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: 8,
            transition: 'width 0.4s ease, background 0.3s',
          }}
        />
      </div>
      {showMacros && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          <MacroBar label="P" current={macros.protein} goal={macroGoals.protein} color={macroColors.protein} />
          <MacroBar label="C" current={macros.carbs} goal={macroGoals.carbs} color={macroColors.carbs} />
          <MacroBar label="F" current={macros.fat} goal={macroGoals.fat} color={macroColors.fat} />
        </div>
      )}
    </div>
  );
}
