import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import LineChart from '../components/charts/LineChart';
import BackHeader from '../components/BackHeader';

const today = new Date().toISOString().split('T')[0];

export default function WeightLog() {
  const [weight, setWeight] = useState('');
  const [logDate, setLogDate] = useState(today);
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['weight'],
    queryFn: () => api.get('/weight', { params: { limit: 90 } }).then(r => r.data),
  });

  const { data: goals } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then(r => r.data),
  });

  const logWeight = useMutation({
    mutationFn: (data) => api.post('/weight', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight'] });
      setWeight('');
      setNotes('');
    },
  });

  const deleteEntry = useMutation({
    mutationFn: (id) => api.delete(`/weight/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weight'] }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!weight) return;
    logWeight.mutate({ weight_lbs: parseFloat(weight), logged_date: logDate, notes: notes.trim() || undefined });
  };

  const chartData = [...entries].reverse().map(w => ({
    ...w,
    label: new Date((typeof w.logged_date === 'string' ? w.logged_date.split('T')[0] : w.logged_date) + 'T12:00:00')
      .toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));

  const targetWeight = goals?.target_weight_lbs ? parseFloat(goals.target_weight_lbs) : undefined;

  return (
    <div>
      <BackHeader title="Weight Log" subtitle="Track your weight over time" />

      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 100, marginBottom: 0 }}>
            <label htmlFor="weightLbs">Weight (lbs)</label>
            <input id="weightLbs" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 175" min="50" step="0.1" required />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
            <label htmlFor="weightDate">Date</label>
            <input id="weightDate" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} max={today} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem', marginBottom: '0.25rem' }} disabled={logWeight.isPending}>
            {logWeight.isPending ? 'Saving...' : 'Log'}
          </button>
        </div>
        <div className="form-group" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ fontSize: '0.85rem' }} />
        </div>
      </form>

      {chartData.length > 1 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Trend</h2>
          <LineChart data={chartData} labelKey="label" valueKey="weight_lbs" lineColor="var(--color-primary)" targetValue={targetWeight} />
          {targetWeight && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.4rem' }}>
              Target: {targetWeight} lbs
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="loading">Loading weight history...</div>
      ) : entries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <p>No weight entries yet. Log your first one above.</p>
        </div>
      ) : (
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>History</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {entries.map(e => {
              const dateStr = typeof e.logged_date === 'string' ? e.logged_date.split('T')[0] : e.logged_date;
              return (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{parseFloat(e.weight_lbs)} lbs</span>
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    {e.notes && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>— {e.notes}</span>}
                  </div>
                  <button
                    onClick={() => deleteEntry.mutate(e.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontSize: '0.8rem' }}
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
