import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import BackHeader from '../components/BackHeader';

const today = new Date().toISOString().split('T')[0];

const typeLabels = {
  streak: 'Logging Streak',
  total_calories: 'Total Calories',
  under_budget: 'Days Under Budget',
};

export default function Challenges() {
  const [showCreate, setShowCreate] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const queryClient = useQueryClient();

  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ['challenges'],
    queryFn: () => api.get('/challenges').then(r => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['challenge-detail', viewingId],
    queryFn: () => api.get(`/challenges/${viewingId}`).then(r => r.data),
    enabled: !!viewingId,
  });

  const joinChallenge = useMutation({
    mutationFn: (id) => api.post(`/challenges/${id}/join`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      if (viewingId) queryClient.invalidateQueries({ queryKey: ['challenge-detail', viewingId] });
    },
  });

  if (isLoading) return <div className="loading">Loading challenges...</div>;

  return (
    <div>
      <BackHeader title="Challenges" subtitle="Compete with friends" />

      <button className="btn btn-primary" style={{ marginBottom: '1rem' }} onClick={() => setShowCreate(!showCreate)}>
        {showCreate ? 'Cancel' : '+ New Challenge'}
      </button>

      {showCreate && <CreateChallengeForm onDone={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['challenges'] }); }} />}

      {challenges.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <p>No challenges yet. Create one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {challenges.map(c => {
            const isActive = today >= c.start_date.split('T')[0] && today <= c.end_date.split('T')[0];
            const isEnded = today > c.end_date.split('T')[0];
            return (
              <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setViewingId(viewingId === c.id ? null : c.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {typeLabels[c.challenge_type]} &middot; Target: {c.target_value} &middot; {c.participant_count} participant{c.participant_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isActive ? 'var(--color-success)' : isEnded ? 'var(--color-text-secondary)' : 'var(--color-primary)' }}>
                    {isActive ? 'Active' : isEnded ? 'Ended' : 'Upcoming'}
                  </span>
                </div>
                {!c.joined && (
                  <button className="btn btn-primary" style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={(e) => { e.stopPropagation(); joinChallenge.mutate(c.id); }}>
                    Join
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Challenge detail */}
      {viewingId && detail && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{detail.title}</h2>
          {detail.description && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{detail.description}</p>}
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
            {new Date(detail.start_date).toLocaleDateString()} — {new Date(detail.end_date).toLocaleDateString()}
          </p>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.4rem' }}>Participants</h3>
          {detail.participants?.map(p => {
            const pct = detail.target_value > 0 ? Math.min((p.progress / detail.target_value) * 100, 100) : 0;
            return (
              <div key={p.user_id} style={{ marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 2 }}>
                  <span style={{ fontWeight: 500 }}>{p.username}</span>
                  <span>{p.progress}/{detail.target_value}</span>
                </div>
                <div style={{ background: 'var(--color-border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--color-success)' : 'var(--color-primary)', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateChallengeForm({ onDone }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [challengeType, setChallengeType] = useState('streak');
  const [targetValue, setTargetValue] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');

  const createChallenge = useMutation({
    mutationFn: (data) => api.post('/challenges', data),
    onSuccess: () => onDone(),
    onError: (err) => setError(err.response?.data?.error || 'Failed to create challenge'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !targetValue || !endDate) { setError('All fields are required'); return; }
    createChallenge.mutate({
      title: title.trim(), description: description.trim() || undefined,
      challenge_type: challengeType, target_value: parseInt(targetValue),
      start_date: startDate, end_date: endDate,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '1rem' }}>
      {error && <div className="error-message">{error}</div>}
      <div className="form-group">
        <label htmlFor="cTitle">Title</label>
        <input id="cTitle" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 7-Day Streak Challenge" required />
      </div>
      <div className="form-group">
        <label htmlFor="cDesc">Description (optional)</label>
        <input id="cDesc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div className="form-group">
          <label htmlFor="cType">Type</label>
          <select id="cType" value={challengeType} onChange={(e) => setChallengeType(e.target.value)}>
            <option value="streak">Logging Streak</option>
            <option value="under_budget">Days Under Budget</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="cTarget">Target (days)</label>
          <input id="cTarget" type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} min="1" required />
        </div>
        <div className="form-group">
          <label htmlFor="cStart">Start</label>
          <input id="cStart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="cEnd">End</label>
          <input id="cEnd" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} required />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={createChallenge.isPending} style={{ width: '100%' }}>
        {createChallenge.isPending ? 'Creating...' : 'Create Challenge'}
      </button>
    </form>
  );
}
