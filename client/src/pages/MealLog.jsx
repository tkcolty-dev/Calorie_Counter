import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import FoodSearch from '../components/FoodSearch';
import TemplateBuilder from '../components/TemplateBuilder';
import BarcodeScanner from '../components/BarcodeScanner';
import PhotoCapture from '../components/PhotoCapture';
import VoiceLogger from '../components/VoiceLogger';
import BackHeader from '../components/BackHeader';

export default function MealLog() {
  const [mealType, setMealType] = useState('lunch');
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
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
  const [showMacros, setShowMacros] = useState(false);
  const macrosRef = useRef(null);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [showVoiceLogger, setShowVoiceLogger] = useState(false);
  const [forUserIds, setForUserIds] = useState([]);
  const [logForSelf, setLogForSelf] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Debounced calorie lookup on name input
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

  const { data: customMeals = [] } = useQuery({
    queryKey: ['custom-meals'],
    queryFn: () => api.get('/custom-meals').then(r => r.data),
  });

  const { data: sharingData } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => api.get('/sharing').then(r => r.data),
    staleTime: 1000 * 60 * 2,
  });

  const sharedUsers = [];
  const seenIds = new Set();
  if (sharingData) {
    for (const s of (sharingData.sharedWithMe || [])) {
      if (s.status === 'accepted' && !seenIds.has(s.owner_id)) {
        seenIds.add(s.owner_id);
        sharedUsers.push({ userId: s.owner_id, username: s.owner_username });
      }
    }
    for (const s of (sharingData.sharing || [])) {
      if (s.status === 'accepted' && !seenIds.has(s.viewer_id)) {
        seenIds.add(s.viewer_id);
        sharedUsers.push({ userId: s.viewer_id, username: s.viewer_username });
      }
    }
  }

  const createMeal = useMutation({
    mutationFn: async (data) => {
      const { for_user_ids, log_for_self, ...rest } = data;
      const targets = [
        ...(log_for_self ? [undefined] : []),
        ...(for_user_ids || []),
      ];
      const res = await Promise.all(targets.map(uid =>
        api.post('/meals', { ...rest, for_user_id: uid })
      ));
      if (saveAsFavorite) {
        await api.post('/custom-meals', {
          name: data.name,
          meal_type: data.meal_type,
          calories: data.calories,
          notes: data.notes,
          protein_g: data.protein_g,
          carbs_g: data.carbs_g,
          fat_g: data.fat_g,
        });
        queryClient.invalidateQueries({ queryKey: ['custom-meals'] });
      }
      return res[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      navigate('/');
    },
    onError: (err) => {
      setError(err.response?.data?.error || 'Failed to log meal');
    },
  });

  const quickLog = useMutation({
    mutationFn: async (meal) => {
      const n = new Date();
      const localISO = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
      if (meal.is_template && meal.template_items) {
        // Log each template item separately
        for (const item of meal.template_items) {
          await api.post('/meals', {
            meal_type: meal.meal_type,
            name: item.name,
            calories: item.calories,
            logged_at: localISO,
          });
        }
        return;
      }
      return api.post('/meals', {
        meal_type: meal.meal_type,
        name: meal.name,
        calories: meal.calories,
        logged_at: localISO,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      navigate('/');
    },
  });

  const handleFoodSelect = (food) => {
    setName(food.name);
    setBaseCal(food.calories_per_serving);
    setServingSize(food.serving_size || '1 serving');
    setQuantity(1);
    setCalories(String(food.calories_per_serving));
    setBaseProtein(food.protein_g ?? null);
    setBaseCarbs(food.carbs_g ?? null);
    setBaseFat(food.fat_g ?? null);
    setProtein(food.protein_g != null ? String(food.protein_g) : '');
    setCarbs(food.carbs_g != null ? String(food.carbs_g) : '');
    setFat(food.fat_g != null ? String(food.fat_g) : '');
    if (food.protein_g != null || food.carbs_g != null || food.fat_g != null) setShowMacros(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !calories) {
      setError('Name and calories are required');
      return;
    }
    if (!logForSelf && forUserIds.length === 0) {
      setError('Select at least one person to log for');
      return;
    }
    // Send local datetime so logged_at::date matches user's local date
    const now = new Date();
    const localISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    createMeal.mutate({
      meal_type: mealType,
      name: name.trim(),
      calories: parseInt(calories),
      notes: notes.trim() || undefined,
      logged_at: localISO,
      protein_g: protein ? parseFloat(protein) : undefined,
      carbs_g: carbs ? parseFloat(carbs) : undefined,
      fat_g: fat ? parseFloat(fat) : undefined,
      for_user_ids: forUserIds.map(id => parseInt(id)),
      log_for_self: logForSelf,
    });
  };

  return (
    <div>
      <BackHeader title="Log a Meal" subtitle="Search for a food or enter details manually" />

      {customMeals.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              My Saved Meals
            </label>
            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setShowTemplateBuilder(true)}>
              + Template
            </button>
          </div>
          <div className="saved-meals-bar">
            {customMeals.map(m => (
              <button
                key={m.id}
                className="saved-meal-chip"
                onClick={() => quickLog.mutate(m)}
                disabled={quickLog.isPending}
              >
                {m.is_template && <span style={{ marginRight: 4 }}>&#x1F4CB;</span>}
                {m.name}
                <span className="saved-meal-chip-cal">{m.calories} cal</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showTemplateBuilder && <TemplateBuilder onClose={() => setShowTemplateBuilder(false)} />}

      <div className="card" style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: 6 }}>
          Quick search from food database
        </label>
        <FoodSearch onSelect={handleFoodSelect} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button className="log-action-btn" onClick={() => setShowBarcodeScanner(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5V3h4"/><path d="M17 3h4v2"/><path d="M21 19v2h-4"/><path d="M7 21H3v-2"/><path d="M7 8v8"/><path d="M11 8v8"/><path d="M15 8v8"/><path d="M19 8v8"/></svg>
            <span>Scan Barcode</span>
          </button>
          <button className="log-action-btn" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Vision model not available">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span>Photo Log</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>Coming soon</span>
          </button>
          <button className="log-action-btn" onClick={() => setShowVoiceLogger(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span>Voice Log</span>
          </button>
        </div>
      </div>

      {showBarcodeScanner && (
        <BarcodeScanner
          onResult={(food) => { handleFoodSelect(food); setShowBarcodeScanner(false); }}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}

      {showPhotoCapture && (
        <PhotoCapture
          onResults={(items) => {
            // Log each detected item
            const n = new Date();
            const localISO = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
            items.forEach(item => {
              createMeal.mutate({
                meal_type: mealType,
                name: item.name,
                calories: item.calories,
                logged_at: localISO,
                protein_g: item.protein_g || undefined,
                carbs_g: item.carbs_g || undefined,
                fat_g: item.fat_g || undefined,
              });
            });
          }}
          onClose={() => setShowPhotoCapture(false)}
        />
      )}

      {showVoiceLogger && (
        <VoiceLogger
          onSelect={(item) => {
            setName(item.name);
            setCalories(String(item.calories || ''));
            setBaseCal(null);
            setServingSize('');
            setQuantity(1);
            setProtein(item.protein_g != null ? String(item.protein_g) : '');
            setCarbs(item.carbs_g != null ? String(item.carbs_g) : '');
            setFat(item.fat_g != null ? String(item.fat_g) : '');
            if (item.protein_g != null || item.carbs_g != null || item.fat_g != null) setShowMacros(true);
            if (item.meal_type) setMealType(item.meal_type);
          }}
          onClose={() => setShowVoiceLogger(false)}
        />
      )}

      <form onSubmit={handleSubmit} className="card">
        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label htmlFor="mealType">Meal type</label>
          <select
            id="mealType"
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
        </div>

        {sharedUsers.length > 0 && (
          <div className="form-group">
            <label>Log for</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={logForSelf}
                  onChange={(e) => setLogForSelf(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Me
              </label>
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
          <label htmlFor="name">Food name</label>
          <input
            id="name"
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
            <label htmlFor="quantity">Quantity</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="quantity"
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
                min="0.25"
                step="any"
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
          <label htmlFor="calories">Calories{baseCal !== null ? ' (auto-calculated)' : ''}</label>
          <input
            id="calories"
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

        <button
          type="button"
          onClick={() => setShowMacros(!showMacros)}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.25rem 0',
            fontSize: '0.85rem',
            color: 'var(--color-primary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            marginBottom: showMacros ? '0.25rem' : 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showMacros ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <polyline points="6 4 14 10 6 16" />
          </svg>
          {showMacros ? 'Close advanced' : 'Open advanced'}
        </button>
        <div
          ref={macrosRef}
          style={{
            maxHeight: showMacros ? (macrosRef.current?.scrollHeight || 200) + 'px' : '0px',
            overflow: 'hidden',
            transition: 'max-height 0.25s ease',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <div className="form-group">
              <label htmlFor="protein">Protein (g)</label>
              <input id="protein" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="--" min="0" step="0.1" />
            </div>
            <div className="form-group">
              <label htmlFor="carbs">Carbs (g)</label>
              <input id="carbs" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="--" min="0" step="0.1" />
            </div>
            <div className="form-group">
              <label htmlFor="fat">Fat (g)</label>
              <input id="fat" type="number" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="--" min="0" step="0.1" />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. With extra avocado"
            />
          </div>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={saveAsFavorite}
              onChange={(e) => setSaveAsFavorite(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Save as favorite meal
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMeal.isPending}
            style={{ flex: 1, padding: '0.625rem' }}
          >
            {createMeal.isPending ? 'Logging...' : forUserIds.length > 0 && logForSelf ? `Log for me + ${forUserIds.length}` : forUserIds.length > 0 && !logForSelf ? `Log for ${forUserIds.length} other${forUserIds.length > 1 ? 's' : ''}` : 'Log Meal'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
            style={{ padding: '0.625rem 1.5rem' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
