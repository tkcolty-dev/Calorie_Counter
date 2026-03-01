import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import MealCard from '../components/MealCard';
import CalorieBudgetBar from '../components/CalorieBudgetBar';
import FoodSearch from '../components/FoodSearch';
import { markSharesSeen } from '../hooks/useNewShares';
import Leaderboard from '../components/Leaderboard';
import { useAuth } from '../context/AuthContext';
import BackHeader from '../components/BackHeader';

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(dateStr) {
  return dateStr === localToday();
}

export default function Sharing() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [viewingUser, setViewingUser] = useState(null);
  const [viewDate, setViewDate] = useState(localToday());
  const [commentText, setCommentText] = useState('');
  const [addFoodMealType, setAddFoodMealType] = useState('snack');
  const commentsEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: sharingData, isLoading } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => api.get('/sharing').then(r => r.data),
    staleTime: 1000 * 60 * 2,
  });

  // Mark all shares as seen when page loads
  useEffect(() => {
    if (sharingData?.sharedWithMe) {
      markSharesSeen();
      queryClient.invalidateQueries({ queryKey: ['shares-seen'] });
    }
  }, [sharingData?.sharedWithMe, queryClient]);

  const { data: sharedMeals } = useQuery({
    queryKey: ['shared-meals', viewingUser?.owner_id, viewDate],
    queryFn: () => api.get(`/sharing/${viewingUser.owner_id}/meals`, { params: { date: viewDate } }).then(r => r.data),
    enabled: !!viewingUser && viewingUser.status === 'accepted',
    staleTime: 1000 * 30,
  });

  const { data: sharedPlanned } = useQuery({
    queryKey: ['shared-planned', viewingUser?.owner_id, viewDate],
    queryFn: () => api.get(`/sharing/${viewingUser.owner_id}/planned-meals`, { params: { from: viewDate } }).then(r => r.data),
    enabled: !!viewingUser && viewingUser.status === 'accepted' && !!viewingUser.share_planned,
    staleTime: 1000 * 30,
  });

  const activeShareId = viewingUser
    ? (sharingData?.sharedWithMe?.find(s => s.owner_id === viewingUser.owner_id)?.id)
    : null;

  const { data: commentsData } = useQuery({
    queryKey: ['share-comments', activeShareId],
    queryFn: () => api.get(`/sharing/${activeShareId}/comments`).then(r => r.data),
    enabled: !!activeShareId && viewingUser?.status === 'accepted',
    refetchInterval: 2000,
    staleTime: 1000,
  });

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [commentsData?.comments?.length]);

  const addShare = useMutation({
    mutationFn: (viewer_username) => api.post('/sharing', { viewer_username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharing'] });
      setUsername('');
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to share'),
  });

  const removeShare = useMutation({
    mutationFn: (id) => api.delete(`/sharing/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sharing'] });
      setViewingUser(null);
    },
  });

  const togglePlanned = useMutation({
    mutationFn: ({ id, share_planned }) => api.patch(`/sharing/${id}`, { share_planned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sharing'] }),
  });

  const respondShare = useMutation({
    mutationFn: ({ id, action }) => api.patch(`/sharing/${id}/respond`, { action }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sharing'] }),
  });

  const addFoodForUser = useMutation({
    mutationFn: (meal) => api.post('/meals', meal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-meals', viewingUser?.owner_id, viewDate] });
    },
  });

  const postComment = useMutation({
    mutationFn: (text) => api.post(`/sharing/${activeShareId}/comments`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-comments', activeShareId] });
      setCommentText('');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    addShare.mutate(username.trim());
  };

  const handleCommentSubmit = (e) => {
    if (e) e.preventDefault();
    if (!commentText.trim()) return;
    postComment.mutate(commentText.trim());
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommentSubmit();
    }
  };

  const handleFoodSelect = (food) => {
    addFoodForUser.mutate({
      for_user_id: viewingUser.owner_id,
      meal_type: addFoodMealType,
      name: food.name,
      calories: food.calories_per_serving,
      protein_g: food.protein_g || null,
      carbs_g: food.carbs_g || null,
      fat_g: food.fat_g || null,
    });
  };

  if (isLoading) return <div className="loading">Loading sharing settings...</div>;

  const { sharing = [], sharedWithMe = [] } = sharingData || {};
  const plannedMeals = sharedPlanned?.plannedMeals || [];
  const activeShareCount = sharing.filter(s => s.status !== 'rejected').length;
  const atLimit = activeShareCount >= 6;

  const pendingInvites = sharedWithMe.filter(s => s.status === 'pending');
  const acceptedShares = sharedWithMe.filter(s => s.status === 'accepted');

  return (
    <div>
      <BackHeader title="Sharing" subtitle="Share your progress or view friends' data" />

      {/* Grant access */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Share Your Data</h2>
          <span style={{ fontSize: '0.8rem', color: atLimit ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
            {activeShareCount}/6
          </span>
        </div>
        {atLimit ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            You've reached the maximum of 6 shares.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username to share with"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.875rem',
                }}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={addShare.isPending}>
              Share
            </button>
          </form>
        )}
        {error && <div className="error-message" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{error}</div>}
      </div>

      {/* People you share with */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>People You Share With</h2>
        {sharing.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            You haven't shared your data with anyone yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sharing.filter(s => s.status !== 'rejected').map(share => (
              <div
                key={share.id}
                style={{
                  padding: '0.5rem 0.75rem',
                  background: 'var(--color-bg)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 500 }}>{share.viewer_username}</span>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '9999px',
                      fontWeight: 600,
                      background: share.status === 'accepted' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                      color: share.status === 'accepted' ? '#16a34a' : '#ca8a04',
                    }}>
                      {share.status === 'accepted' ? 'Active' : 'Pending'}
                    </span>
                  </div>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    onClick={() => removeShare.mutate(share.id)}
                  >
                    Revoke
                  </button>
                </div>
                {share.status === 'accepted' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!share.share_planned}
                      onChange={() => togglePlanned.mutate({ id: share.id, share_planned: !share.share_planned })}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    Share planned meals
                  </label>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared with me */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Shared With Me</h2>

        {/* Pending invitations */}
        {pendingInvites.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
              Pending Invitations
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pendingInvites.map(share => (
                <div
                  key={share.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(234, 179, 8, 0.05)',
                    border: '1px solid rgba(234, 179, 8, 0.2)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{share.owner_username}</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() => respondShare.mutate({ id: share.id, action: 'accepted' })}
                      disabled={respondShare.isPending}
                    >
                      Accept
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() => respondShare.mutate({ id: share.id, action: 'rejected' })}
                      disabled={respondShare.isPending}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted shares */}
        {acceptedShares.length === 0 && pendingInvites.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Nobody has shared their data with you yet.
          </p>
        ) : acceptedShares.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {acceptedShares.map(share => (
              <div key={share.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    if (viewingUser?.owner_id === share.owner_id) {
                      setViewingUser(null);
                    } else {
                      setViewingUser(share);
                      setViewDate(localToday());
                    }
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    background: viewingUser?.owner_id === share.owner_id ? 'rgba(37, 99, 235, 0.05)' : 'var(--color-bg)',
                    border: viewingUser?.owner_id === share.owner_id ? '1px solid var(--color-primary)' : '1px solid transparent',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{share.owner_username}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                    {viewingUser?.owner_id === share.owner_id ? 'Hide' : 'View meals'}
                  </span>
                </button>
                <button
                  className="btn btn-danger"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', flexShrink: 0 }}
                  onClick={() => removeShare.mutate(share.id)}
                  title="Remove share"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Viewing shared user's data */}
        {acceptedShares.length > 0 && <Leaderboard />}

        {viewingUser && viewingUser.status === 'accepted' && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
            {/* Date navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <button
                className="btn"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                onClick={() => setViewDate(addDays(viewDate, -1))}
              >
                &larr; Prev
              </button>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {isToday(viewDate) ? 'Today' : formatDate(viewDate)}
              </span>
              <button
                className="btn"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                onClick={() => setViewDate(addDays(viewDate, 1))}
              >
                Next &rarr;
              </button>
            </div>

            {/* Logged meals */}
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              {viewingUser.owner_username}'s Logged Meals
            </h3>
            {sharedMeals && (
              <>
                <CalorieBudgetBar
                  consumed={sharedMeals.meals.reduce((s, m) => s + m.calories, 0)}
                  goal={sharedMeals.goals.daily_total}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                  {sharedMeals.meals.length === 0 ? (
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>No meals logged.</p>
                  ) : (
                    sharedMeals.meals.map(meal => <MealCard key={meal.id} meal={meal} />)
                  )}
                </div>
              </>
            )}

            {/* Add food for this user */}
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius)' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Log food for {viewingUser.owner_username}
              </h4>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                <select
                  value={addFoodMealType}
                  onChange={e => setAddFoodMealType(e.target.value)}
                  style={{
                    padding: '0.4rem 0.5rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.8rem',
                    background: 'var(--color-surface)',
                  }}
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                </select>
                {addFoodForUser.isPending && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Adding...</span>
                )}
                {addFoodForUser.isSuccess && (
                  <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>Added!</span>
                )}
              </div>
              <FoodSearch onSelect={handleFoodSelect} />
            </div>

            {/* Planned meals */}
            {viewingUser.share_planned && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Planned Meals</h3>
                  {plannedMeals.length > 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {plannedMeals.reduce((s, m) => s + m.calories, 0)} cal planned
                    </span>
                  )}
                </div>
                {plannedMeals.length === 0 ? (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>No planned meals for this day.</p>
                ) : (
                  plannedMeals.map(meal => (
                    <div key={meal.id} className="planned-meal-item" style={{ cursor: 'default' }}>
                      <span className="planned-meal-pending" title="Planned">&#x25CB;</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {meal.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                          {meal.meal_type} &middot; {meal.calories} cal
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Chat */}
            {activeShareId && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Chat</h3>
                <div className="share-chat-messages">
                  {(!commentsData?.comments || commentsData.comments.length === 0) ? (
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', margin: 'auto', textAlign: 'center' }}>
                      No messages yet. Say hi!
                    </p>
                  ) : (
                    commentsData.comments.map((c, i) => {
                      const isMine = c.sender_username === user?.username;
                      const prev = commentsData.comments[i - 1];
                      const sameSender = prev && prev.sender_username === c.sender_username;
                      return (
                        <div key={c.id} className={`share-chat-msg ${isMine ? 'mine' : 'theirs'}`} style={sameSender ? { marginTop: '-0.1rem' } : { marginTop: '0.35rem' }}>
                          {!sameSender && !isMine && <div className="chat-sender">{c.sender_username}</div>}
                          <div>{c.text}</div>
                          <div className="chat-time">
                            {new Date(c.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={commentsEndRef} />
                </div>
                <form onSubmit={handleCommentSubmit} className="share-chat-input">
                  <input
                    type="text"
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Message..."
                  />
                  <button type="submit" className="btn btn-primary" disabled={postComment.isPending || !commentText.trim()}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
