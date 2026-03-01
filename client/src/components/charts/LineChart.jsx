export default function LineChart({ data, labelKey, valueKey, height = 160, lineColor = 'var(--color-primary)', targetValue }) {
  if (!data || data.length === 0) return null;

  const values = data.map(d => parseFloat(d[valueKey]) || 0);
  const minVal = Math.min(...values, targetValue || Infinity) * 0.98;
  const maxVal = Math.max(...values, targetValue || 0) * 1.02;
  const range = maxVal - minVal || 1;

  const padding = { top: 10, right: 10, bottom: 28, left: 10 };
  const chartW = 300 - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padding.top + chartH - ((parseFloat(d[valueKey]) - minVal) / range) * chartH;
    return { x, y, val: d[valueKey], label: d[labelKey] };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 300 ${height}`} style={{ width: '100%', height }}>
      {targetValue && (
        <>
          <line
            x1={padding.left} x2={300 - padding.right}
            y1={padding.top + chartH - ((targetValue - minVal) / range) * chartH}
            y2={padding.top + chartH - ((targetValue - minVal) / range) * chartH}
            stroke="var(--color-success)" strokeWidth="1" strokeDasharray="4,3" opacity="0.5"
          />
          <text
            x={300 - padding.right}
            y={padding.top + chartH - ((targetValue - minVal) / range) * chartH - 3}
            textAnchor="end" fontSize="8" fill="var(--color-success)" opacity="0.7"
          >
            Target
          </text>
        </>
      )}
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={2.5} fill={lineColor} />
          {i % Math.ceil(data.length / 7) === 0 && (
            <text x={p.x} y={height - 4} textAnchor="middle" fontSize="7" fill="var(--color-text-secondary)">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
