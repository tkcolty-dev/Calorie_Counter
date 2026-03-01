import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { usePushNotifications } from '../hooks/usePushNotifications';
import BackHeader from '../components/BackHeader';

const typeLabels = {
  favorite: 'Favorite Foods',
  cuisine: 'Cuisine',
  dietary: 'Dietary',
  dislike: 'Dislikes',
  usual_meal: 'Usual Meals',
};

const typeColors = {
  cuisine: '#3b82f6',
  dietary: '#16a34a',
  favorite: '#f59e0b',
  dislike: '#dc2626',
  usual_meal: '#8b5cf6',
};

const QUICK_FAVORITES = [
  'Chicken', 'Rice', 'Pizza', 'Tacos', 'Pasta', 'Eggs', 'Sandwich', 'Burgers',
  'Goldfish Crackers', 'Chips', 'Popcorn', 'Apple', 'Banana', 'Yogurt',
  'Mac & Cheese', 'Grilled Cheese', 'Hot Dog', 'Salad', 'Soup', 'Cereal',
];

export default function Preferences() {
  const [type, setType] = useState('cuisine');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const { isSubscribed, isSupported, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications();

  const { data: preferences = [], isLoading } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get('/preferences').then(r => r.data),
  });

  const addPref = useMutation({
    mutationFn: (data) => api.post('/preferences', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
      setValue('');
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to add'),
  });

  const deletePref = useMutation({
    mutationFn: (id) => api.delete(`/preferences/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    addPref.mutate({ preference_type: type, value: value.trim() });
  };

  const grouped = {};
  for (const pref of preferences) {
    if (!grouped[pref.preference_type]) grouped[pref.preference_type] = [];
    grouped[pref.preference_type].push(pref);
  }

  if (isLoading) return <div className="loading">Loading preferences...</div>;

  return (
    <div>
      <BackHeader title="Food Preferences" subtitle="Help the AI give you better meal suggestions" />

      {isSupported && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>Notifications</label>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {isSubscribed ? 'Push notifications enabled' : 'Get meal reminders'}
              </p>
            </div>
            <button
              className={`btn ${isSubscribed ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => isSubscribed ? unsubscribe() : subscribe()}
              disabled={pushLoading}
              style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
            >
              {pushLoading ? '...' : isSubscribed ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: 8 }}>
          Quick add favorites
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {QUICK_FAVORITES.filter(f => {
            const favs = grouped.favorite || [];
            return !favs.some(p => p.value.toLowerCase() === f.toLowerCase());
          }).map(food => (
            <button
              key={food}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem', borderRadius: 20 }}
              onClick={() => addPref.mutate({ preference_type: 'favorite', value: food })}
              disabled={addPref.isPending}
            >
              + {food}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '1.5rem' }}>
        {error && <div className="error-message">{error}</div>}

        <div className="pref-add-form" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
            <label htmlFor="prefType">Type</label>
            <select id="prefType" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="cuisine">Cuisine</option>
              <option value="dietary">Dietary</option>
              <option value="favorite">Favorite Food</option>
              <option value="dislike">Dislike</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label htmlFor="prefValue">Value</label>
            <input
              id="prefValue"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'cuisine' ? 'e.g. Italian, Mexican' : type === 'dietary' ? 'e.g. vegetarian, gluten-free' : type === 'favorite' ? 'e.g. sushi, pizza' : 'e.g. mushrooms, liver'}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={addPref.isPending}
            style={{ padding: '0.5rem 1.25rem', whiteSpace: 'nowrap' }}
          >
            Add
          </button>
        </div>
      </form>

      {Object.keys(grouped).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          No preferences set yet. Add some to improve your AI suggestions!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Object.entries(typeLabels).map(([key, label]) => {
            const items = grouped[key];
            if (!items) return null;
            return (
              <div key={key} className="card">
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: typeColors[key] }}>
                  {label}
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {items.map(pref => (
                    <span
                      key={pref.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.25rem 0.75rem',
                        background: `${typeColors[key]}10`,
                        border: `1px solid ${typeColors[key]}30`,
                        borderRadius: 20,
                        fontSize: '0.85rem',
                      }}
                    >
                      {pref.value}
                      <button
                        onClick={() => deletePref.mutate(pref.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-secondary)',
                          fontSize: '1rem',
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
