import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import FoodSearch from '../components/FoodSearch';
import TemplateBuilder from '../components/TemplateBuilder';
import BarcodeScanner from '../components/BarcodeScanner';
import PhotoCapture from '../components/PhotoCapture';
import VoiceLogger from '../components/VoiceLogger';
import BackHeader from '../components/BackHeader';

function nowLocalISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
}

function newItemId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultMealTypeForNow() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

export default function MealLog() {
  const [mealType, setMealType] = useState(defaultMealTypeForNow);
  const [items, setItems] = useState([]);
  // Per-item form state
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
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
  const [justAddedId, setJustAddedId] = useState(null);
  // Per-meal state
  const [notes, setNotes] = useState('');
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [error, setError] = useState('');
  const [forUserIds, setForUserIds] = useState([]);
  const [logForSelf, setLogForSelf] = useState(true);
  // Modal state
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [showVoiceLogger, setShowVoiceLogger] = useState(false);
  const [describeText, setDescribeText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nameInputRef = useRef(null);

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();

  const { data: topFoods = [] } = useQuery({
    queryKey: ['top-foods-log'],
    queryFn: () => api.get('/meals/top-foods', { params: { days: 30, today: todayStr } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });

  const { data: suggestionData } = useQuery({
    queryKey: ['suggestion-log', todayStr],
    queryFn: () => api.get('/suggestions', { params: { today: todayStr, hour: new Date().getHours() } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });
  const suggestion = suggestionData?.suggestion || null;

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
    }, 150);
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

  const sharedUsers = useMemo(() => {
    const out = [];
    const seen = new Set();
    if (sharingData) {
      for (const s of (sharingData.sharedWithMe || [])) {
        if (s.status === 'accepted' && !seen.has(s.owner_id)) {
          seen.add(s.owner_id);
          out.push({ userId: s.owner_id, username: s.owner_username });
        }
      }
      for (const s of (sharingData.sharing || [])) {
        if (s.status === 'accepted' && !seen.has(s.viewer_id)) {
          seen.add(s.viewer_id);
          out.push({ userId: s.viewer_id, username: s.viewer_username });
        }
      }
    }
    return out;
  }, [sharingData]);

  const totals = useMemo(() => items.reduce((acc, i) => ({
    calories: acc.calories + (i.calories || 0),
    protein_g: acc.protein_g + (i.protein_g || 0),
    carbs_g:   acc.carbs_g   + (i.carbs_g   || 0),
    fat_g:     acc.fat_g     + (i.fat_g     || 0),
    anyMacros: acc.anyMacros || i.protein_g != null || i.carbs_g != null || i.fat_g != null,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, anyMacros: false }), [items]);

  const createMeal = useMutation({
    mutationFn: async (data) => {
      const { items: allItems, meal_type, notes: mealNotes, logged_at, for_user_ids, log_for_self } = data;
      const targets = [
        ...(log_for_self ? [undefined] : []),
        ...(for_user_ids || []),
      ];
      // Fire all meal POSTs in parallel — much faster for multi-item / multi-target logs.
      const requests = [];
      for (const target of targets) {
        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i];
          requests.push(api.post('/meals', {
            meal_type,
            name: item.name,
            calories: item.calories,
            notes: i === 0 ? mealNotes : undefined,
            logged_at,
            protein_g: item.protein_g ?? undefined,
            carbs_g: item.carbs_g ?? undefined,
            fat_g: item.fat_g ?? undefined,
            for_user_id: target,
          }));
        }
      }
      await Promise.all(requests);
      if (saveAsFavorite) {
        if (allItems.length > 1) {
          const templateName = allItems.map(i => i.name).slice(0, 3).join(' + ') + (allItems.length > 3 ? ' + …' : '');
          const totalCal = allItems.reduce((s, i) => s + i.calories, 0);
          await api.post('/custom-meals', {
            name: templateName,
            meal_type,
            calories: totalCal,
            notes: mealNotes || null,
            template_items: allItems.map(i => ({
              name: i.name,
              calories: i.calories,
              protein_g: i.protein_g,
              carbs_g: i.carbs_g,
              fat_g: i.fat_g,
            })),
            is_template: true,
          });
        } else {
          const only = allItems[0];
          await api.post('/custom-meals', {
            name: only.name,
            meal_type,
            calories: only.calories,
            notes: mealNotes || null,
            protein_g: only.protein_g,
            carbs_g: only.carbs_g,
            fat_g: only.fat_g,
          });
        }
        queryClient.invalidateQueries({ queryKey: ['custom-meals'] });
      }
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
      const localISO = nowLocalISO();
      if (meal.is_template && meal.template_items) {
        const ids = [];
        let totalCal = 0;
        for (const item of meal.template_items) {
          const created = await api.post('/meals', {
            meal_type: meal.meal_type,
            name: item.name,
            calories: item.calories,
            logged_at: localISO,
            protein_g: item.protein_g ?? undefined,
            carbs_g: item.carbs_g ?? undefined,
            fat_g: item.fat_g ?? undefined,
          });
          if (created?.data?.id) ids.push(created.data.id);
          totalCal += item.calories || 0;
        }
        return { name: meal.name, calories: totalCal, ids };
      }
      const created = await api.post('/meals', {
        meal_type: meal.meal_type,
        name: meal.name,
        calories: meal.calories,
        logged_at: localISO,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
      });
      return { name: meal.name, calories: meal.calories, ids: created?.data?.id ? [created.data.id] : [] };
    },
    onSuccess: (info) => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      if (info && info.name) {
        window.dispatchEvent(new CustomEvent('meal-logged-toast', {
          detail: { name: info.name, calories: info.calories, ids: info.ids || [] },
        }));
      }
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

  const resetItemForm = () => {
    setName('');
    setCalories('');
    setProtein(''); setCarbs(''); setFat('');
    setBaseCal(null); setBaseProtein(null); setBaseCarbs(null); setBaseFat(null);
    setQuantity(1); setServingSize('');
    setShowMacros(false);
    setCalorieHints([]);
  };

  const buildItemFromForm = () => {
    if (!name.trim() || !calories) return null;
    return {
      id: newItemId(),
      name: name.trim(),
      calories: parseInt(calories),
      protein_g: protein ? parseFloat(protein) : null,
      carbs_g: carbs ? parseFloat(carbs) : null,
      fat_g: fat ? parseFloat(fat) : null,
    };
  };

  const addItem = () => {
    setError('');
    const item = buildItemFromForm();
    if (!item) {
      setError('Item name and calories are required');
      return;
    }
    setItems(prev => [...prev, item]);
    setJustAddedId(item.id);
    setTimeout(() => setJustAddedId(null), 700);
    resetItemForm();
    nameInputRef.current?.focus();
  };

  const removeItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // One-tap add from a food search result — no need to fill the form.
  const quickAddFood = (food) => {
    const item = {
      id: newItemId(),
      name: food.name,
      calories: food.calories_per_serving,
      protein_g: food.protein_g ?? null,
      carbs_g: food.carbs_g ?? null,
      fat_g: food.fat_g ?? null,
    };
    setItems(prev => [...prev, item]);
    setJustAddedId(item.id);
    setTimeout(() => setJustAddedId(null), 700);
  };

  const quickAddTopFood = (food) => {
    const item = {
      id: newItemId(),
      name: food.name,
      calories: food.avg_calories,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    };
    setItems(prev => [...prev, item]);
    setJustAddedId(item.id);
    setTimeout(() => setJustAddedId(null), 700);
  };

  const handleDescribe = async () => {
    const text = describeText.trim();
    if (!text || parsing) return;
    setError('');
    setParsing(true);
    try {
      const res = await api.post('/voice-log', { transcript: text, today: todayStr });
      const parsed = res.data.meals || [];
      if (parsed.length === 0) {
        setError("Couldn't find any food in that. Try \"two eggs and toast\".");
      } else {
        const newItems = parsed.map(p => ({
          id: newItemId(),
          name: p.name,
          calories: p.calories,
          protein_g: p.protein_g ?? null,
          carbs_g: p.carbs_g ?? null,
          fat_g: p.fat_g ?? null,
        }));
        setItems(prev => [...prev, ...newItems]);
        setDescribeText('');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not parse that. Try a search instead.');
    } finally {
      setParsing(false);
    }
  };

  const handleItemKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      addItem();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const allItems = [...items];
    const pending = buildItemFromForm();
    if (pending) allItems.push(pending);
    if (allItems.length === 0) {
      setError('Add at least one item to your meal');
      return;
    }
    if (!logForSelf && forUserIds.length === 0) {
      setError('Select at least one person to log for');
      return;
    }
    createMeal.mutate({
      items: allItems,
      meal_type: mealType,
      notes: notes.trim() || undefined,
      logged_at: nowLocalISO(),
      for_user_ids: forUserIds.map(id => parseInt(id)),
      log_for_self: logForSelf,
    });
  };

  const submitLabel = (() => {
    if (createMeal.isPending) return 'Logging…';
    const pending = buildItemFromForm();
    const count = items.length + (pending ? 1 : 0);
    if (count === 0) return 'Log meal';
    const targetCount = (logForSelf ? 1 : 0) + forUserIds.length;
    const itemPart = count === 1 ? 'Log meal' : `Log meal · ${count} items`;
    if (targetCount > 1) return `${itemPart} (×${targetCount})`;
    return itemPart;
  })();

  return (
    <div>
      <BackHeader title="Log a Meal" subtitle="Pick a fast path or add manually" />

      {/* Smart "your usual" suggestion banner — one tap to log */}
      {suggestion && items.length === 0 && (
        <button
          className="qls-suggestion"
          style={{ marginBottom: '0.85rem' }}
          onClick={() => {
            setMealType(suggestion.meal_type);
            quickLog.mutate({
              meal_type: suggestion.meal_type,
              name: suggestion.name,
              calories: suggestion.calories,
            });
          }}
          disabled={quickLog.isPending}
        >
          <div className="qls-suggestion-spark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>
          </div>
          <div className="qls-suggestion-body">
            <div className="qls-suggestion-eyebrow">Your usual {suggestion.meal_type}</div>
            <div className="qls-suggestion-name">{suggestion.name}</div>
          </div>
          <div className="qls-suggestion-cta">
            <span className="qls-suggestion-cal">{suggestion.calories}</span>
            <span className="qls-suggestion-go">Log</span>
          </div>
        </button>
      )}

      {/* Top-row capture method tiles — biggest, fastest paths */}
      <div className="qls-methods" style={{ marginBottom: '0.85rem' }}>
        <button className="qls-method qls-method-photo" onClick={() => setShowPhotoCapture(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
          </svg>
          <span>Photo</span>
        </button>
        <button className="qls-method qls-method-voice" onClick={() => setShowVoiceLogger(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          <span>Voice</span>
        </button>
        <button className="qls-method qls-method-scan" onClick={() => setShowBarcodeScanner(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5V3h4"/><path d="M17 3h4v2"/><path d="M21 19v2h-4"/><path d="M7 21H3v-2"/><path d="M7 8v8"/><path d="M11 8v8"/><path d="M15 8v8"/><path d="M19 8v8"/>
          </svg>
          <span>Scan</span>
        </button>
      </div>

      {/* Describe-it natural language input */}
      <div className="qls-describe" style={{ marginBottom: '0.85rem' }}>
        <input
          type="text"
          className="qls-describe-input"
          placeholder='Or describe it: "two eggs and toast"'
          value={describeText}
          onChange={(e) => setDescribeText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleDescribe(); } }}
          disabled={parsing}
        />
        <button
          type="button"
          className="qls-describe-go"
          onClick={handleDescribe}
          disabled={parsing || !describeText.trim()}
          aria-label="Parse and add"
        >
          {parsing ? (
            <span className="qls-spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: '0.75rem', padding: '0.85rem 1rem' }}>
        <FoodSearch onSelect={handleFoodSelect} onQuickAdd={quickAddFood} />
      </div>

      {/* Frequent foods — one tap to add to current meal */}
      {topFoods.length > 0 && items.length === 0 && (
        <div style={{ marginBottom: '0.85rem' }}>
          <div className="qls-section-label" style={{ marginTop: 0 }}>Frequent · tap to add</div>
          <div className="qls-chip-row">
            {topFoods.slice(0, 6).map(f => (
              <button
                key={f.name}
                type="button"
                className="qls-chip qls-chip-recent"
                onClick={() => quickAddTopFood(f)}
              >
                <span className="qls-chip-name">{f.name}</span>
                <span className="qls-chip-cal">{f.avg_calories}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Saved meals — one tap to log entire template */}
      {customMeals.length > 0 && items.length === 0 && (
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="qls-section-label" style={{ margin: 0 }}>Saved meals</span>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '0.25rem 0.55rem' }} onClick={() => setShowTemplateBuilder(true)}>
              + Template
            </button>
          </div>
          <div className="qls-chip-row">
            {customMeals.map(m => (
              <button
                key={m.id}
                type="button"
                className="qls-chip qls-chip-saved"
                onClick={() => quickLog.mutate(m)}
                disabled={quickLog.isPending}
              >
                {m.is_template && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, opacity: 0.7 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
                  </svg>
                )}
                <span className="qls-chip-name">{m.name}</span>
                <span className="qls-chip-cal">{m.calories}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showTemplateBuilder && <TemplateBuilder onClose={() => setShowTemplateBuilder(false)} />}

      {showBarcodeScanner && (
        <BarcodeScanner
          onResult={(food) => { handleFoodSelect(food); setShowBarcodeScanner(false); }}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}

      {showPhotoCapture && (
        <PhotoCapture
          onResults={(detected) => {
            const newItems = detected.map(it => ({
              id: newItemId(),
              name: it.name,
              calories: it.calories,
              protein_g: it.protein_g ?? null,
              carbs_g: it.carbs_g ?? null,
              fat_g: it.fat_g ?? null,
            }));
            setItems(prev => [...prev, ...newItems]);
            setShowPhotoCapture(false);
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

      <form onSubmit={handleSubmit} className="card meal-log-card">
        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label>Meal type</label>
          <div className="qls-meal-type-row" style={{ marginBottom: 0 }}>
            {['breakfast', 'lunch', 'dinner', 'snack'].map(t => (
              <button
                key={t}
                type="button"
                className={`qls-meal-pill${mealType === t ? ' active' : ''}`}
                onClick={() => setMealType(t)}
              >
                <span style={{ textTransform: 'capitalize' }}>{t}</span>
              </button>
            ))}
          </div>
        </div>

        {sharedUsers.length > 0 && (
          <div className="qls-target-row" style={{ marginBottom: '0.6rem', paddingBottom: '0.55rem' }}>
            <span className="qls-target-label">Log for</span>
            <div className="qls-target-chips">
              <button
                type="button"
                className={`qls-target-chip${logForSelf ? ' active' : ''}`}
                onClick={() => setLogForSelf(s => !s)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={logForSelf ? 3 : 0} strokeLinecap="round" strokeLinejoin="round" style={{ display: logForSelf ? 'inline-block' : 'none' }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Me
              </button>
              {sharedUsers.map(s => {
                const id = String(s.userId);
                const active = forUserIds.includes(id);
                return (
                  <button
                    key={s.userId}
                    type="button"
                    className={`qls-target-chip${active ? ' active' : ''}`}
                    onClick={() => setForUserIds(prev => active ? prev.filter(x => x !== id) : [...prev, id])}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 3 : 0} strokeLinecap="round" strokeLinejoin="round" style={{ display: active ? 'inline-block' : 'none' }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {s.username}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Items list */}
        {items.length > 0 && (
          <div className="meal-items-list">
            <div className="meal-items-header">
              <span>{items.length} item{items.length > 1 ? 's' : ''} in this meal</span>
              <span className="meal-items-total-cal">{totals.calories} cal</span>
            </div>
            <div className="meal-items-rows">
              {items.map((it) => (
                <div
                  key={it.id}
                  className={`meal-item-row${justAddedId === it.id ? ' just-added' : ''}`}
                >
                  <div className="meal-item-body">
                    <div className="meal-item-name">{it.name}</div>
                    <div className="meal-item-meta">
                      {it.calories} cal
                      {it.protein_g != null && ` · ${it.protein_g}g P`}
                      {it.carbs_g != null && ` · ${it.carbs_g}g C`}
                      {it.fat_g != null && ` · ${it.fat_g}g F`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="meal-item-remove"
                    onClick={() => removeItem(it.id)}
                    aria-label={`Remove ${it.name}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            {totals.anyMacros && (
              <div className="meal-items-totals">
                Total: {totals.calories} cal
                {totals.protein_g > 0 && ` · ${Math.round(totals.protein_g * 10) / 10}g P`}
                {totals.carbs_g > 0   && ` · ${Math.round(totals.carbs_g   * 10) / 10}g C`}
                {totals.fat_g > 0     && ` · ${Math.round(totals.fat_g     * 10) / 10}g F`}
              </div>
            )}
          </div>
        )}

        {/* Add an item form - collapsed by default; expanded automatically when user starts typing or has items */}
        {!showAdvanced && items.length === 0 && (
          <button
            type="button"
            className="meal-log-toggle"
            onClick={() => setShowAdvanced(true)}
            style={{ marginTop: '0.4rem' }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/>
            </svg>
            Add manually with macros
          </button>
        )}
        <div className="meal-item-form" style={{ display: (showAdvanced || items.length > 0) ? 'block' : 'none' }}>
          <div className="meal-item-form-header">
            {items.length > 0 ? 'Add another item' : 'Add an item'}
          </div>

          <div className="form-group">
            <label htmlFor="name">Food name</label>
            <input
              ref={nameInputRef}
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleItemKeyDown}
              placeholder="e.g. Grilled chicken salad"
              autoComplete="off"
            />
            {calorieHints.length > 0 && (
              <div className="calorie-hint">
                {calorieHints.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    className="calorie-hint-item"
                    onClick={() => {
                      handleFoodSelect(food);
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
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  × {servingSize} ({baseCal} cal each)
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
              onKeyDown={handleItemKeyDown}
              placeholder="e.g. 450"
              min="0"
              inputMode="numeric"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowMacros(!showMacros)}
            className="meal-log-toggle"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showMacros ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <polyline points="6 4 14 10 6 16" />
            </svg>
            {showMacros ? 'Hide macros' : 'Add macros'}
          </button>

          <div className={`meal-log-macros ${showMacros ? 'open' : ''}`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group">
                <label htmlFor="protein">Protein (g)</label>
                <input id="protein" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="--" min="0" step="0.1" inputMode="decimal" />
              </div>
              <div className="form-group">
                <label htmlFor="carbs">Carbs (g)</label>
                <input id="carbs" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="--" min="0" step="0.1" inputMode="decimal" />
              </div>
              <div className="form-group">
                <label htmlFor="fat">Fat (g)</label>
                <input id="fat" type="number" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="--" min="0" step="0.1" inputMode="decimal" />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary meal-add-item-btn"
            onClick={addItem}
            disabled={!name.trim() || !calories}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add another item
          </button>
        </div>

        {/* Meal-level notes & favorite */}
        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Lunch out with friends"
          />
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={saveAsFavorite}
              onChange={(e) => setSaveAsFavorite(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            {items.length > 1 || (items.length === 1 && (name.trim() || calories))
              ? 'Save this combo as a template'
              : 'Save as favorite meal'}
          </label>
        </div>

        <div className="meal-log-actions-sticky" style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMeal.isPending}
            style={{ flex: 1, padding: '0.85rem', fontSize: '0.95rem', fontWeight: 600 }}
          >
            {submitLabel}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
            style={{ padding: '0.85rem 1.25rem' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
