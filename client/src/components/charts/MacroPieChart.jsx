export default function MacroPieChart({ protein = 0, carbs = 0, fat = 0, size = 120 }) {
  const total = protein + carbs + fat;
  if (total === 0) return null;

  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const innerR = r * 0.6;

  const segments = [
    { value: protein, color: '#3b82f6', label: 'Protein' },
    { value: carbs, color: '#f59e0b', label: 'Carbs' },
    { value: fat, color: '#ef4444', label: 'Fat' },
  ].filter(s => s.value > 0);

  let startAngle = -Math.PI / 2;
  const arcs = segments.map(seg => {
    const angle = (seg.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(startAngle);
    const iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(endAngle);
    const iy2 = cy + innerR * Math.sin(endAngle);
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    startAngle = endAngle;
    return { ...seg, d, pct: Math.round((seg.value / total) * 100) };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((arc, i) => (
          <path key={i} d={arc.d} fill={arc.color} opacity={0.85} />
        ))}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
        {arcs.map((arc, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: arc.color, flexShrink: 0 }} />
            <span>{arc.label}: {Math.round(arc.value)}g ({arc.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
