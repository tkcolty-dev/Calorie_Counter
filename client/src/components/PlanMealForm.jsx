import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

export default function PlanMealForm({ date, onClose, onSuccess }) {
  const [mealType, setMealType] = useState('lunch');
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [calorieHints, setCalorieHints] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [baseCal, setBaseCal] = useState(null);
  const [servingSize, setServingSize] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [baseProtein, setBaseProtein] = useState(null);
  const [baseCarbs, setBaseCarbs] = useState(null);
  const [baseFat, setBaseFat] = useState(null);
  const [recurrence, setRecurrence] = useState('');
  const [recurrenceEnd, setRecurrenceEnd] = useState('');
  const [forUserIds, setForUserIds] = useState([]);
  const queryClient = useQueryClient();

  // Fetch shared users (people who shared with me — I can plan for them)
  const { data: sharingData } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => api.get('/sharing').then(r => r.data),
    staleTime: 1000 * 60 * 2,
  });

  // Deduplicate shared users from both directions
  const sharedUsers = [];
  const seenIds = new Set();
  for (const s of (sharingData?.sharedWithMe || [])) {
    if (s.status === 'accepted' && !seenIds.has(s.owner_id)) {
      seenIds.add(s.owner_id);
      sharedUsers.push({ userId: s.owner_id, username: s.owner_username });
    }
  }
  for (const s of (sharingData?.sharing || [])) {
    if (s.status === 'accepted' && !seenIds.has(s.viewer_id)) {
      seenIds.add(s.viewer_id);
      sharedUsers.push({ userId: s.viewer_id, username: s.viewer_username });
    }
  }

  useEffect(() => {
    if (name.length < 2) {
      setCalorieHints([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/foods', { params: { q: name } });
        setCalorieHints(res.data.slice(0, 3));
      } catch {
        setCalorieHints([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [name]);

  const createPlanned = useMutation({
    mutationFn: async (data) => {
      const { for_user_ids, ...rest } = data;
      // Always plan for yourself, plus any selected users
      const targets = [undefined, ...(for_user_ids || [])];
      await Promise.all(targets.map(uid =>
        api.post('/planned-meals', { ...rest, for_user_id: uid })
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-meals'] });
      onSuccess();
    },
    onError: (err) => {
      setError(err.response?.data?.error || 'Failed to plan meal');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !calories) {
      setError('Name and calories are required');
      return;
    }
    createPlanned.mutate({
      meal_type: mealType,
      name: name.trim(),
      calories: parseInt(calories),
      notes: notes.trim() || undefined,
      planned_date: date,
      protein_g: protein ? parseFloat(protein) : undefined,
      carbs_g: carbs ? parseFloat(carbs) : undefined,
      fat_g: fat ? parseFloat(fat) : undefined,
      recurrence: recurrence || undefined,
      recurrence_end: recurrenceEnd || undefined,
      for_user_ids: forUserIds.map(id => parseInt(id)),
    });
  };

  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Plan a Meal</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{label}</span>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="planMealType">Meal type</label>
            <select id="planMealType" value={mealType} onChange={(e) => setMealType(e.target.value)}>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          {sharedUsers.length > 0 && (
            <div className="form-group">
              <label>Also plan for</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                {sharedUsers.map(s => (
                  <label key={s.userId} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={forUserIds.includes(String(s.userId))}
                      onChange={(e) => {
                        const id = String(s.userId);
                        setForUserIds(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id));
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    {s.username}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="planName">Food name</label>
            <input
              id="planName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grilled chicken salad"
              autoComplete="off"
              required
            />
            {calorieHints.length > 0 && (
              <div className="calorie-hint">
                {calorieHints.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    className="calorie-hint-item"
                    onClick={() => {
                      setName(food.name);
                      setBaseCal(food.calories_per_serving);
                      setServingSize(food.serving_size || '1 serving');
                      setQuantity(1);
                      setCalories(String(food.calories_per_serving));
                      setCalorieHints([]);
                      setBaseProtein(food.protein_g ?? null);
                      setBaseCarbs(food.carbs_g ?? null);
                      setBaseFat(food.fat_g ?? null);
                      setProtein(food.protein_g != null ? String(food.protein_g) : '');
                      setCarbs(food.carbs_g != null ? String(food.carbs_g) : '');
                      setFat(food.fat_g != null ? String(food.fat_g) : '');
                    }}
                  >
                    {food.name}{food.brand ? ` (${food.brand})` : ''}: ~{food.calories_per_serving} cal ({food.serving_size})
                  </button>
                ))}
              </div>
            )}
          </div>

          {baseCal !== null && (
            <div className="form-group">
              <label htmlFor="planQuantity">Quantity</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  id="planQuantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => {
                    const q = parseFloat(e.target.value) || 0;
                    setQuantity(q);
                    setCalories(String(Math.round(baseCal * q)));
                    if (baseProtein != null) setProtein(String(Math.round(baseProtein * q * 10) / 10));
                    if (baseCarbs != null) setCarbs(String(Math.round(baseCarbs * q * 10) / 10));
                    if (baseFat != null) setFat(String(Math.round(baseFat * q * 10) / 10));
                  }}
                  min="0.5"
                  step="0.5"
                  style={{ width: '5rem' }}
                  required
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  x {servingSize} ({baseCal} cal each)
                </span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="planCalories">Calories{baseCal !== null ? ' (auto-calculated)' : ''}</label>
            <input
              id="planCalories"
              type="number"
              value={calories}
              onChange={(e) => {
                setCalories(e.target.value);
                if (baseCal !== null && parseFloat(e.target.value) > 0) {
                  setQuantity(parseFloat((parseFloat(e.target.value) / baseCal).toFixed(1)));
                }
              }}
              placeholder="e.g. 450"
              min="0"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <div className="form-group">
              <label htmlFor="planProtein">Protein (g)</label>
              <input id="planProtein" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="--" min="0" step="0.1" />
            </div>
            <div className="form-group">
              <label htmlFor="planCarbs">Carbs (g)</label>
              <input id="planCarbs" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="--" min="0" step="0.1" />
            </div>
            <div className="form-group">
              <label htmlFor="planFat">Fat (g)</label>
              <input id="planFat" type="number" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="--" min="0" step="0.1" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div className="form-group">
              <label htmlFor="planRecurrence">Repeat</label>
              <select id="planRecurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            {recurrence && (
              <div className="form-group">
                <label htmlFor="planRecurrenceEnd">Until (optional)</label>
                <input id="planRecurrenceEnd" type="date" value={recurrenceEnd} onChange={(e) => setRecurrenceEnd(e.target.value)} min={date} />
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="planNotes">Notes (optional)</label>
            <textarea
              id="planNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. With extra avocado"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createPlanned.isPending}
              style={{ flex: 1, padding: '0.625rem' }}
            >
              {createPlanned.isPending ? 'Saving...' : forUserIds.length > 0 ? `Plan for me + ${forUserIds.length}` : 'Plan Meal'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ padding: '0.625rem 1.5rem' }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
