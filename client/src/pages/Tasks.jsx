import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import BackHeader from '../components/BackHeader';

function formatDue(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d - now;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin > -1 && diffMin < 1) return 'now';
  if (diffMin > 0 && diffMin < 60) return `in ${diffMin}m`;
  if (diffMin < 0 && diffMin > -60) return `${Math.abs(diffMin)}m ago`;

  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

export default function Tasks() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks?status=all').then(r => r.data),
  });

  const tasks = data?.tasks || [];

  const toggleComplete = useMutation({
    mutationFn: (id) => api.patch(`/tasks/${id}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteTask = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  if (isLoading) return <div className="loading">Loading tasks...</div>;

  return (
    <div>
      <BackHeader title="Tasks" subtitle="Reminders until you complete them" />

      <button
        className="btn btn-primary"
        style={{ marginBottom: '1rem' }}
        onClick={() => setShowCreate(!showCreate)}
      >
        {showCreate ? 'Cancel' : '+ New Task'}
      </button>

      {showCreate && (
        <CreateTaskForm
          onDone={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}

      {tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <p>No tasks yet. Create one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tasks.map(task => {
            const isDone = !!task.completed_at;
            const isOverdue = !isDone && new Date(task.due_at) < new Date();
            const isSelf = task.created_by === task.user_id;

            return (
              <div
                key={task.id}
                className="card"
                style={{
                  opacity: isDone ? 0.6 : 1,
                  borderLeft: `3px solid ${isDone ? 'var(--color-success)' : isOverdue ? 'var(--color-danger)' : 'var(--color-primary)'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleComplete.mutate(task.id)}
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: `2px solid ${isDone ? 'var(--color-success)' : 'var(--color-border)'}`,
                      background: isDone ? 'var(--color-success)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {isDone && '\u2713'}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600,
                      textDecoration: isDone ? 'line-through' : 'none',
                      wordBreak: 'break-word',
                    }}>
                      {task.title}
                    </div>
                    {task.note && (
                      <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--color-text-secondary)',
                        marginTop: 2,
                        wordBreak: 'break-word',
                      }}>
                        {task.note}
                      </div>
                    )}
                    <div style={{
                      fontSize: '0.75rem',
                      color: isOverdue ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                      marginTop: 4,
                      display: 'flex',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}>
                      <span>{isOverdue ? 'Overdue \u00b7 ' : ''}{formatDue(task.due_at)}</span>
                      {!isSelf && (
                        <span style={{ color: 'var(--color-primary)' }}>
                          from {task.created_by_username}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTask.mutate(task.id); }}
                    style={{
                      flexShrink: 0,
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-danger)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.5rem',
                      minWidth: 44,
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getPresets() {
  const now = new Date();
  const presets = [];

  const makeDate = (hoursFromNow) => {
    const d = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return d;
  };

  const todayAt = (hour) => {
    const d = new Date(now);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  const tomorrowAt = (hour) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  presets.push({ label: 'In 30 min', date: new Date(now.getTime() + 30 * 60 * 1000) });
  presets.push({ label: 'In 1 hour', date: makeDate(1) });
  presets.push({ label: 'In 2 hours', date: makeDate(2) });

  if (now.getHours() < 12) {
    presets.push({ label: 'This afternoon', date: todayAt(14) });
    presets.push({ label: 'This evening', date: todayAt(18) });
  } else if (now.getHours() < 17) {
    presets.push({ label: 'This evening', date: todayAt(18) });
    presets.push({ label: 'Tonight', date: todayAt(21) });
  }

  presets.push({ label: 'Tomorrow morning', date: tomorrowAt(8) });
  presets.push({ label: 'Tomorrow noon', date: tomorrowAt(12) });

  return presets;
}

function CreateTaskForm({ onDone }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customDue, setCustomDue] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [forUserId, setForUserId] = useState('');
  const [error, setError] = useState('');

  const presets = getPresets();

  const { data: assignable } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: () => api.get('/tasks/assignable-users').then(r => r.data),
  });

  const sharedUsers = assignable?.users || [];

  const createTask = useMutation({
    mutationFn: (data) => api.post('/tasks', data),
    onSuccess: () => onDone(),
    onError: (err) => setError(err.response?.data?.error || 'Failed to create task'),
  });

  const getDueAt = () => {
    if (showCustom) return new Date(customDue).toISOString();
    if (selectedPreset !== null) return presets[selectedPreset].date.toISOString();
    return null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    const due_at = getDueAt();
    if (!due_at) { setError('Pick when this is due'); return; }

    createTask.mutate({
      title: title.trim(),
      note: note.trim() || undefined,
      due_at,
      for_user_id: forUserId ? parseInt(forUserId) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '1rem' }}>
      {error && <div className="error-message">{error}</div>}
      <div className="form-group">
        <label htmlFor="taskTitle">What needs to be done?</label>
        <input
          id="taskTitle"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Log your lunch"
          required
          autoFocus
        />
      </div>
      <div className="form-group">
        <label htmlFor="taskNote">Note (optional)</label>
        <input
          id="taskNote"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Extra details"
        />
      </div>
      <div className="form-group">
        <label>When is it due?</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
          {presets.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setSelectedPreset(i); setShowCustom(false); }}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 8,
                border: selectedPreset === i && !showCustom ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: selectedPreset === i && !showCustom ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' : 'var(--color-surface)',
                color: selectedPreset === i && !showCustom ? 'var(--color-primary)' : 'var(--color-text)',
                fontSize: '0.85rem',
                fontWeight: selectedPreset === i && !showCustom ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setShowCustom(true); setSelectedPreset(null); }}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: 8,
              border: showCustom ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              background: showCustom ? 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' : 'var(--color-surface)',
              color: showCustom ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontSize: '0.85rem',
              fontWeight: showCustom ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            Custom...
          </button>
        </div>
        {showCustom && (
          <input
            type="datetime-local"
            value={customDue}
            onChange={(e) => setCustomDue(e.target.value)}
            style={{ marginTop: '0.4rem', fontSize: '1rem' }}
          />
        )}
      </div>
      {sharedUsers.length > 0 && (
        <div className="form-group">
          <label htmlFor="taskFor">Assign to</label>
          <select
            id="taskFor"
            value={forUserId}
            onChange={(e) => setForUserId(e.target.value)}
          >
            <option value="">Myself</option>
            {sharedUsers.map(u => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={createTask.isPending}
        style={{ width: '100%' }}
      >
        {createTask.isPending ? 'Creating...' : 'Create Task'}
      </button>
    </form>
  );
}
