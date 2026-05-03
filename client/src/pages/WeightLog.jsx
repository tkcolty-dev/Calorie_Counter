import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import LineChart from '../components/charts/LineChart';
import BackHeader from '../components/BackHeader';

const today = new Date().toISOString().split('T')[0];

function readShareWeight() {
  try {
    const raw = localStorage.getItem('share-weight');
    return raw === '1' || raw === 'true';
  } catch { return false; }
}

export default function WeightLog() {
  const [weight, setWeight] = useState('');
  const [logDate, setLogDate] = useState(today);
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  // Re-render when the share-weight flag changes (e.g. user toggles it
  // in Settings on another tab, or the boot-time sync flips it).
  const [shareWeightOn, setShareWeightOn] = useState(readShareWeight);
  useEffect(() => {
    const onChange = () => setShareWeightOn(readShareWeight());
    window.addEventListener('home-display-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('home-display-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  // Reuse the cached ['sharing'] query (already polled by useNewShares /
  // the Sharing page) so we don't fire an extra request just for the count.
  const { data: sharingData } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => api.get('/sharing').then(r => r.data),
    staleTime: 1000 * 30,
  });
  // A viewer can see weight when (a) the share is accepted AND (b) the
  // per-share share_weight resolves true — explicit true wins; null/
  // undefined falls back to the global flag.
  const viewerCount = (sharingData?.sharing || []).filter(s => {
    if (s.status !== 'accepted') return false;
    if (s.share_weight === true) return true;
    if (s.share_weight === false) return false;
    return shareWeightOn;
  }).length;
  const sharingToAnyone = viewerCount > 0;

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

  // Compute progress stats
  const sortedByDate = [...entries].sort((a, b) => {
    const da = typeof a.logged_date === 'string' ? a.logged_date.split('T')[0] : a.logged_date;
    const db = typeof b.logged_date === 'string' ? b.logged_date.split('T')[0] : b.logged_date;
    return da.localeCompare(db);
  });
  const startWeight = sortedByDate.length > 0 ? parseFloat(sortedByDate[0].weight_lbs) : null;
  const currentWeight = sortedByDate.length > 0 ? parseFloat(sortedByDate[sortedByDate.length - 1].weight_lbs) : null;
  const totalChange = startWeight != null && currentWeight != null ? currentWeight - startWeight : null;
  const toTarget = targetWeight && currentWeight != null ? currentWeight - targetWeight : null;

  return (
    <div>
      <BackHeader title="Weight Log" subtitle="Track your weight over time" />

      <div
        className="card"
        style={{
          marginBottom: '1rem',
          padding: '0.7rem 0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.7rem',
          background: sharingToAnyone ? 'rgba(34, 197, 94, 0.08)' : 'var(--color-surface)',
          border: `1px solid ${sharingToAnyone ? 'rgba(34, 197, 94, 0.35)' : 'var(--color-border)'}`,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: sharingToAnyone ? '#16a34a' : 'var(--color-text-secondary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            {sharingToAnyone ? (
              <>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </>
            ) : (
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </>
            )}
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {sharingToAnyone
              ? `Sharing with ${viewerCount} ${viewerCount === 1 ? 'person' : 'people'}`
              : (shareWeightOn
                  ? 'Sharing on · nobody in your group yet'
                  : 'Private · only you can see this')}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 1 }}>
            {sharingToAnyone
              ? 'Tap Manage to choose who can see your weight, or turn it off in Settings.'
              : (shareWeightOn
                  ? 'Invite friends in the Sharing tab to share with them.'
                  : 'Turn on "Share my weight" in Settings, or share with specific people from the Sharing tab.')}
          </div>
        </div>
        <Link
          to={sharingToAnyone || shareWeightOn ? '/sharing' : '/settings'}
          className="btn btn-secondary"
          style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', flexShrink: 0, textDecoration: 'none' }}
        >
          {sharingToAnyone || shareWeightOn ? 'Manage' : 'Enable'}
        </Link>
      </div>

      {sortedByDate.length >= 2 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Progress</h2>
          <div style={{ display: 'grid', gridTemplateColumns: targetWeight ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 2 }}>Starting</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{startWeight} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>lbs</span></div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 2 }}>Change</div>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: totalChange < 0 ? 'var(--color-success, #16a34a)' : totalChange > 0 ? 'var(--color-danger, #dc2626)' : 'var(--color-text)',
              }}>
                {totalChange > 0 ? '+' : ''}{totalChange.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>lbs</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                {totalChange < 0 ? `${Math.abs(totalChange).toFixed(1)} lbs lost` : totalChange > 0 ? `${totalChange.toFixed(1)} lbs gained` : 'No change'}
              </div>
            </div>
            {targetWeight && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 2 }}>To Goal</div>
                <div style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: toTarget <= 0 ? 'var(--color-success, #16a34a)' : 'var(--color-text-secondary)',
                }}>
                  {toTarget <= 0 ? 'Reached!' : `${toTarget.toFixed(1)}`} {toTarget > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>lbs left</span>}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                  Target: {targetWeight} lbs
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="weightLbs">Weight (lbs)</label>
            <input id="weightLbs" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 175" min="50" step="0.1" inputMode="decimal" required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="weightDate">Date</label>
            <input id="weightDate" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} max={today} required />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: '0.6rem', marginBottom: '0.6rem' }}>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem', fontWeight: 600 }} disabled={logWeight.isPending}>
          {logWeight.isPending ? 'Saving…' : 'Log weight'}
        </button>
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
