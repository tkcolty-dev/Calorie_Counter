import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import BarChart from '../components/charts/BarChart';
import LineChart from '../components/charts/LineChart';
import MacroPieChart from '../components/charts/MacroPieChart';
import StreakBadge from '../components/charts/StreakBadge';
import BackHeader from '../components/BackHeader';

const today = new Date().toISOString().split('T')[0];
const periods = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
];

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Reports() {
  const [period, setPeriod] = useState(14);

  const { data: dailySummary = [] } = useQuery({
    queryKey: ['reports-daily', period],
    queryFn: () => api.get('/reports/daily-summary', { params: { days: period, today } }).then(r => r.data),
  });

  const { data: streaks } = useQuery({
    queryKey: ['reports-streaks'],
    queryFn: () => api.get('/reports/streaks', { params: { today } }).then(r => r.data),
  });

  const { data: averages } = useQuery({
    queryKey: ['reports-averages', period],
    queryFn: () => api.get('/reports/averages', { params: { days: period, today } }).then(r => r.data),
  });

  const { data: goals } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then(r => r.data),
  });

  const { data: weightData = [] } = useQuery({
    queryKey: ['weight-report'],
    queryFn: () => api.get('/weight', { params: { limit: 30 } }).then(r => r.data),
  });

  const chartData = dailySummary.map(d => ({
    ...d,
    label: formatShortDate(typeof d.date === 'string' ? d.date.split('T')[0] : d.date),
  }));

  const weightChartData = [...weightData].reverse().map(w => ({
    ...w,
    label: formatShortDate(typeof w.logged_date === 'string' ? w.logged_date.split('T')[0] : w.logged_date),
  }));

  return (
    <div>
      <BackHeader title="Reports" subtitle="Your tracking insights" />

      {/* Period selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {periods.map(p => (
          <button
            key={p.days}
            className={`btn ${period === p.days ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
            onClick={() => setPeriod(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Streaks */}
      {streaks && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Streaks</h2>
          <StreakBadge {...streaks} />
        </div>
      )}

      {/* Averages */}
      {averages && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Averages ({period} days)</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
            <div><span style={{ fontWeight: 600 }}>{averages.avg_calories || 0}</span> <span style={{ color: 'var(--color-text-secondary)' }}>cal/day</span></div>
            {averages.avg_protein > 0 && <div><span style={{ fontWeight: 600 }}>{averages.avg_protein}g</span> <span style={{ color: 'var(--color-text-secondary)' }}>protein</span></div>}
            {averages.avg_carbs > 0 && <div><span style={{ fontWeight: 600 }}>{averages.avg_carbs}g</span> <span style={{ color: 'var(--color-text-secondary)' }}>carbs</span></div>}
            {averages.avg_fat > 0 && <div><span style={{ fontWeight: 600 }}>{averages.avg_fat}g</span> <span style={{ color: 'var(--color-text-secondary)' }}>fat</span></div>}
          </div>
        </div>
      )}

      {/* Daily calories bar chart */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Daily Calories</h2>
          <BarChart data={chartData} labelKey="label" valueKey="total_calories" goal={goals?.daily_total || 2000} />
        </div>
      )}

      {/* Macro breakdown */}
      {averages && (averages.avg_protein > 0 || averages.avg_carbs > 0 || averages.avg_fat > 0) && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Average Macro Split</h2>
          <MacroPieChart
            protein={parseFloat(averages.avg_protein) || 0}
            carbs={parseFloat(averages.avg_carbs) || 0}
            fat={parseFloat(averages.avg_fat) || 0}
          />
        </div>
      )}

      {/* Weight chart */}
      {weightChartData.length > 1 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Weight Trend</h2>
          <LineChart
            data={weightChartData}
            labelKey="label"
            valueKey="weight_lbs"
            lineColor="var(--color-primary)"
            targetValue={goals?.target_weight_lbs ? parseFloat(goals.target_weight_lbs) : undefined}
          />
        </div>
      )}
    </div>
  );
}
