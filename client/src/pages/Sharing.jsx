import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import MealCard from '../components/MealCard';
import CalorieBudgetBar from '../components/CalorieBudgetBar';
import FoodSearch from '../components/FoodSearch';
import WeekStrip from '../components/WeekStrip';
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

function relativeDayLabel(dateStr) {
  const today = localToday();
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  if (dateStr === addDays(today, 1)) return 'Tomorrow';
  return null;
}

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function buildMembers(sharing, sharedWithMe) {
  const map = new Map();
  for (const s of sharing) {
    const key = s.viewer_id;
    if (!map.has(key)) map.set(key, { otherUserId: key, username: s.viewer_username });
    map.get(key).outgoing = s;
  }
  for (const s of sharedWithMe) {
    const key = s.owner_id;
    if (!map.has(key)) map.set(key, { otherUserId: key, username: s.owner_username });
    map.get(key).incoming = s;
  }
  return Array.from(map.values());
}

function memberStatus(m) {
  const out = m.outgoing?.status;
  const inc = m.incoming?.status;
  if (inc === 'pending') return { kind: 'invite-to-me', label: 'Wants to connect' };
  if (out === 'accepted' && inc === 'accepted') return { kind: 'mutual', label: 'Connected' };
  if (out === 'accepted' && !inc) return { kind: 'one-way-out', label: 'They haven’t shared back' };
  if (!out && inc === 'accepted') return { kind: 'one-way-in', label: 'Sharing with you' };
  if (out === 'pending') return { kind: 'invite-from-me', label: 'Invite sent' };
  if (out === 'rejected') return { kind: 'rejected', label: 'Declined' };
  return { kind: 'unknown', label: '' };
}

const sortOrder = {
  'invite-to-me': 0,
  'mutual': 1,
  'one-way-in': 2,
  'one-way-out': 3,
  'invite-from-me': 4,
  'rejected': 5,
  'unknown': 6,
};

function StatusPill({ kind, label }) {
  const colors = {
    'mutual':         { bg: 'rgba(34, 197, 94, 0.12)',  fg: '#16a34a' },
    'one-way-in':     { bg: 'rgba(37, 99, 235, 0.10)',  fg: 'var(--color-primary)' },
    'one-way-out':    { bg: 'rgba(99, 102, 241, 0.10)', fg: '#6366f1' },
    'invite-to-me':   { bg: 'rgba(234, 179, 8, 0.14)',  fg: '#ca8a04' },
    'invite-from-me': { bg: 'rgba(148, 163, 184, 0.14)', fg: '#64748b' },
    'rejected':       { bg: 'rgba(148, 163, 184, 0.14)', fg: '#64748b' },
    'unknown':        { bg: 'rgba(148, 163, 184, 0.14)', fg: '#64748b' },
  }[kind] || { bg: 'rgba(148, 163, 184, 0.14)', fg: '#64748b' };
  if (!label) return null;
  return (
    <span style={{
      fontSize: '0.7rem',
      padding: '0.12rem 0.5rem',
      borderRadius: '9999px',
      fontWeight: 600,
      background: colors.bg,
      color: colors.fg,
      whiteSpace: 'nowrap',
      lineHeight: 1.4,
    }}>
      {label}
    </span>
  );
}

function Avatar({ name }) {
  return (
    <div
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--color-primary), #6366f1)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '0.95rem',
        flexShrink: 0,
      }}
    >
      {initialOf(name)}
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transition: 'transform 0.18s',
        transform: open ? 'rotate(180deg)' : 'rotate(0)',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function Sharing() {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [viewDate, setViewDate] = useState(localToday());
  const [slideDir, setSlideDir] = useState('right');
  const [commentText, setCommentText] = useState('');
  const [addFoodMealType, setAddFoodMealType] = useState('snack');
  const commentsEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: sharingData, isLoading } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => api.get('/sharing').then(r => r.data),
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (sharingData?.sharedWithMe) {
      markSharesSeen();
      queryClient.invalidateQueries({ queryKey: ['shares-seen'] });
    }
  }, [sharingData?.sharedWithMe, queryClient]);

  const members = useMemo(() => {
    return buildMembers(sharingData?.sharing || [], sharingData?.sharedWithMe || []);
  }, [sharingData]);

  const expandedMember = members.find(m => m.otherUserId === expandedUserId) || null;
  const canViewExpanded = expandedMember?.incoming?.status === 'accepted';

  const { data: sharedMeals } = useQuery({
    queryKey: ['shared-meals', expandedUserId, viewDate],
    queryFn: () => api.get(`/sharing/${expandedUserId}/meals`, { params: { date: viewDate } }).then(r => r.data),
    enabled: !!expandedUserId && !!canViewExpanded,
    staleTime: 1000 * 30,
  });

  const { data: sharedPlanned } = useQuery({
    queryKey: ['shared-planned', expandedUserId, viewDate],
    queryFn: () => api.get(`/sharing/${expandedUserId}/planned-meals`, { params: { from: viewDate } }).then(r => r.data),
    enabled: !!expandedUserId && !!canViewExpanded && !!expandedMember?.incoming?.share_planned,
    staleTime: 1000 * 30,
  });

  const activeShareId = expandedMember?.incoming?.id || null;

  const { data: commentsData } = useQuery({
    queryKey: ['share-comments', activeShareId],
    queryFn: () => api.get(`/sharing/${activeShareId}/comments`).then(r => r.data),
    enabled: !!activeShareId,
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sharing'] }),
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
      queryClient.invalidateQueries({ queryKey: ['shared-meals', expandedUserId, viewDate] });
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
      for_user_id: expandedUserId,
      meal_type: addFoodMealType,
      name: food.name,
      calories: food.calories_per_serving,
      protein_g: food.protein_g || null,
      carbs_g: food.carbs_g || null,
      fat_g: food.fat_g || null,
    });
  };

  const handleRemove = (m) => {
    if (!window.confirm(`Remove ${m.username} from your group?`)) return;
    if (m.outgoing) removeShare.mutate(m.outgoing.id);
    if (m.incoming) removeShare.mutate(m.incoming.id);
    if (expandedUserId === m.otherUserId) setExpandedUserId(null);
  };

  if (isLoading) return <div className="loading">Loading sharing settings...</div>;

  const outgoingActive = (sharingData?.sharing || []).filter(s => s.status !== 'rejected').length;
  const atLimit = outgoingActive >= 6;

  const sortedMembers = [...members].sort((a, b) => {
    const sa = sortOrder[memberStatus(a).kind] ?? 9;
    const sb = sortOrder[memberStatus(b).kind] ?? 9;
    if (sa !== sb) return sa - sb;
    return (a.username || '').localeCompare(b.username || '');
  });

  const plannedMeals = sharedPlanned?.plannedMeals || [];
  const totalCalories = sharedMeals?.meals?.reduce((s, m) => s + m.calories, 0) || 0;

  return (
    <div>
      <BackHeader title="Sharing" subtitle="Your group — share meals with friends" />

      {/* Invite */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Invite to your group</h2>
          <span style={{ fontSize: '0.75rem', color: atLimit ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
            {outgoingActive}/6 sharing
          </span>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem', margin: '0 0 0.6rem', lineHeight: 1.4 }}>
          Sharing is two-way. When they accept, they'll see your meals — and can choose to share theirs back with you.
        </p>
        {atLimit ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            You've reached the maximum of 6 outgoing shares. Remove someone to invite more.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{
                flex: 1,
                padding: '0.55rem 0.75rem',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                fontSize: '0.9rem',
              }}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={addShare.isPending} style={{ padding: '0.5rem 1rem' }}>
              {addShare.isPending ? 'Adding…' : 'Invite'}
            </button>
          </form>
        )}
        {error && <div className="error-message" style={{ marginTop: '0.6rem', marginBottom: 0 }}>{error}</div>}
      </div>

      {/* Members */}
      <div className="card sharing-member-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Members</h2>
          {sortedMembers.length > 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              {sortedMembers.length} {sortedMembers.length === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>

        {sortedMembers.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            Nobody in your group yet. Invite a friend by username above.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sortedMembers.map(m => {
              const status = memberStatus(m);
              const isExpanded = expandedUserId === m.otherUserId;
              const canExpand = m.incoming?.status === 'accepted';
              const isPendingInvite = status.kind === 'invite-to-me';

              const headerClickable = canExpand && !isPendingInvite;
              const toggleExpand = () => {
                setExpandedUserId(isExpanded ? null : m.otherUserId);
                if (!isExpanded) {
                  setSlideDir('right');
                  setViewDate(localToday());
                }
              };
              const goToDate = (date) => {
                setSlideDir(date >= viewDate ? 'right' : 'left');
                setViewDate(date);
              };

              return (
                <div
                  key={m.otherUserId}
                  style={{
                    background: isExpanded ? 'rgba(37, 99, 235, 0.04)' : 'var(--color-bg)',
                    border: isExpanded ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  {/* Header row — whole row clickable when expandable */}
                  <div
                    className="sharing-member-row"
                    role={headerClickable ? 'button' : undefined}
                    tabIndex={headerClickable ? 0 : undefined}
                    onClick={headerClickable ? toggleExpand : undefined}
                    onKeyDown={headerClickable ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpand();
                      }
                    } : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.7rem',
                      padding: '0.7rem 0.85rem',
                      cursor: headerClickable ? 'pointer' : 'default',
                    }}
                  >
                    <Avatar name={m.username} />

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span style={{
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {m.username}
                      </span>
                      <StatusPill kind={status.kind} label={status.label} />
                    </div>

                    {isPendingInvite ? (
                      <div className="sharing-pending-actions" style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                          onClick={() => respondShare.mutate({ id: m.incoming.id, action: 'rejected' })}
                          disabled={respondShare.isPending}
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                          onClick={() => respondShare.mutate({ id: m.incoming.id, action: 'accepted' })}
                          disabled={respondShare.isPending}
                        >
                          Accept
                        </button>
                      </div>
                    ) : canExpand ? (
                      <span aria-hidden style={{ color: 'var(--color-text-secondary)', display: 'flex', flexShrink: 0 }}>
                        <Chevron open={isExpanded} />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', flexShrink: 0 }}
                        onClick={() => handleRemove(m)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Expanded view */}
                  {isExpanded && canExpand && (
                    <div className="sharing-member-expanded" style={{ borderTop: '1px solid var(--color-border)', padding: '0.85rem' }}>
                      {/* Planned meals toggle (sharing direction back) */}
                      {m.outgoing?.status === 'accepted' && (
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          fontSize: '0.78rem',
                          color: 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          marginBottom: '0.75rem',
                        }}>
                          <input
                            type="checkbox"
                            checked={!!m.outgoing.share_planned}
                            onChange={() => togglePlanned.mutate({ id: m.outgoing.id, share_planned: !m.outgoing.share_planned })}
                            style={{ accentColor: 'var(--color-primary)' }}
                          />
                          Share my planned meals with {m.username}
                        </label>
                      )}

                      {/* Date navigation */}
                      <div className="sharing-day-nav">
                        <WeekStrip
                          selectedDate={viewDate}
                          onSelectDate={goToDate}
                          datesWithPlans={new Set()}
                        />
                        <div className="sharing-day-bar">
                          <div className="sharing-day-label">
                            <span className="sharing-day-rel">
                              {relativeDayLabel(viewDate) || formatDate(viewDate).split(',')[0]}
                            </span>
                            <span className="sharing-day-full">{formatDate(viewDate)}</span>
                          </div>
                          {!isToday(viewDate) && (
                            <button
                              type="button"
                              className="btn btn-secondary sharing-day-today-btn"
                              onClick={() => goToDate(localToday())}
                            >
                              Today
                            </button>
                          )}
                        </div>
                        {!isToday(viewDate) && (
                          <p className="sharing-day-today-hint">
                            Today is {formatDate(localToday())}
                          </p>
                        )}
                      </div>

                      <div
                        key={viewDate}
                        className={slideDir === 'left' ? 'day-slide-left' : 'day-slide-right'}
                      >
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.4rem' }}>
                          {m.username}'s logged meals
                        </h3>
                        {sharedMeals && (
                          <>
                            <CalorieBudgetBar
                              consumed={totalCalories}
                              goal={sharedMeals.goals.daily_total}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.6rem' }}>
                              {sharedMeals.meals.length === 0 ? (
                                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', margin: 0 }}>No meals logged.</p>
                              ) : (
                                sharedMeals.meals.map(meal => <MealCard key={meal.id} meal={meal} />)
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div style={{ marginTop: '0.9rem', padding: '0.6rem', background: 'var(--color-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.4rem' }}>
                          Log food for {m.username}
                        </h4>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
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
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Adding…</span>
                          )}
                          {addFoodForUser.isSuccess && (
                            <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>Added!</span>
                          )}
                        </div>
                        <FoodSearch onSelect={handleFoodSelect} />
                      </div>

                      {m.incoming?.share_planned && (
                        <div
                          key={`planned-${viewDate}`}
                          className={slideDir === 'left' ? 'day-slide-left' : 'day-slide-right'}
                          style={{ marginTop: '0.9rem' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>Planned meals</h3>
                            {plannedMeals.length > 0 && (
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                {plannedMeals.reduce((s, x) => s + x.calories, 0)} cal planned
                              </span>
                            )}
                          </div>
                          {plannedMeals.length === 0 ? (
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', margin: 0 }}>No planned meals for this day.</p>
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

                      {activeShareId && (
                        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.4rem' }}>Chat</h3>
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
                              placeholder="Message…"
                            />
                            <button type="submit" className="btn btn-primary" disabled={postComment.isPending || !commentText.trim()}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>
                            </button>
                          </form>
                        </div>
                      )}

                      {/* Footer remove */}
                      <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                          onClick={() => handleRemove(m)}
                        >
                          Remove from group
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {members.some(m => m.incoming?.status === 'accepted') && <Leaderboard />}
    </div>
  );
}
