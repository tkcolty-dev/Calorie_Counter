import { useMemo } from 'react';

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WeekStrip({ selectedDate, onSelectDate, datesWithPlans }) {
  const today = formatDate(new Date());

  const { weekStart, days } = useMemo(() => {
    const sel = new Date(selectedDate + 'T12:00:00');
    const dow = sel.getDay();
    const start = new Date(sel);
    start.setDate(start.getDate() - dow);
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      result.push(formatDate(d));
    }
    return { weekStart: formatDate(start), days: result };
  }, [selectedDate]);

  const shift = (offset) => {
    const sel = new Date(selectedDate + 'T12:00:00');
    sel.setDate(sel.getDate() + offset);
    onSelectDate(formatDate(sel));
  };

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="week-strip">
      <button className="week-strip-arrow" onClick={() => shift(-7)} aria-label="Previous week">&lsaquo;</button>
      <div className="week-strip-days">
        {days.map((date) => {
          const d = new Date(date + 'T12:00:00');
          const isSelected = date === selectedDate;
          const isToday = date === today;
          const hasPlan = datesWithPlans.has(date);
          return (
            <button
              key={date}
              className={`week-strip-day${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
              onClick={() => onSelectDate(date)}
            >
              <span className="week-strip-day-label">{dayLabels[d.getDay()]}</span>
              <span className="week-strip-day-num">{d.getDate()}</span>
              {hasPlan && <span className="week-strip-day-dot" />}
            </button>
          );
        })}
      </div>
      <button className="week-strip-arrow" onClick={() => shift(7)} aria-label="Next week">&rsaquo;</button>
    </div>
  );
}
