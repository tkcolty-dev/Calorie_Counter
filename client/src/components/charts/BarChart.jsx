export default function BarChart({ data, labelKey, valueKey, goal, height = 180, barColor = 'var(--color-primary)' }) {
  if (!data || data.length === 0) return null;

  const maxVal = Math.max(...data.map(d => d[valueKey]), goal || 0);
  const padding = { top: 10, right: 10, bottom: 28, left: 10 };
  const chartH = height - padding.top - padding.bottom;
  const barGap = 2;
  const barWidth = Math.max(((300 - padding.left - padding.right) / data.length) - barGap, 4);

  return (
    <svg viewBox={`0 0 300 ${height}`} style={{ width: '100%', height }}>
      {goal > 0 && (
        <>
          <line
            x1={padding.left} x2={300 - padding.right}
            y1={padding.top + chartH * (1 - goal / maxVal)}
            y2={padding.top + chartH * (1 - goal / maxVal)}
            stroke="var(--color-danger)" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
          />
          <text
            x={300 - padding.right} y={padding.top + chartH * (1 - goal / maxVal) - 3}
            textAnchor="end" fontSize="8" fill="var(--color-danger)" opacity="0.7"
          >
            Goal
          </text>
        </>
      )}
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const barH = maxVal > 0 ? (val / maxVal) * chartH : 0;
        const x = padding.left + i * (barWidth + barGap);
        const y = padding.top + chartH - barH;
        const isOver = goal && val > goal;
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={barWidth} height={Math.max(barH, 1)}
              rx={2} fill={isOver ? 'var(--color-danger)' : barColor} opacity={0.85}
            />
            {i % Math.ceil(data.length / 7) === 0 && (
              <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" fontSize="7" fill="var(--color-text-secondary)">
                {d[labelKey]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
