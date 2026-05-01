import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import FoodSearch from './FoodSearch';
import PhotoCapture from './PhotoCapture';
import VoiceLogger from './VoiceLogger';
import BarcodeScanner from './BarcodeScanner';

function nowLocalISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
}

function defaultMealTypeForNow() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

const today = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

export default function QuickLogSheet({ open, onClose }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mealType, setMealType] = useState(defaultMealTypeForNow);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [logged, setLogged] = useState(false);
  const [error, setError] = useState('');
  const [describeText, setDescribeText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const sheetRef = useRef(null);

  const { data: topFoods = [] } = useQuery({
    queryKey: ['top-foods-quick'],
    queryFn: () => api.get('/meals/top-foods', { params: { days: 30, today: today() } }).then(r => r.data),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const { data: customMeals = [] } = useQuery({
    queryKey: ['custom-meals'],
    queryFn: () => api.get('/custom-meals').then(r => r.data),
    enabled: open,
  });

  const { data: suggestionData } = useQuery({
    queryKey: ['suggestion-quick', today()],
    queryFn: () => api.get('/suggestions', { params: { today: today(), hour: new Date().getHours() } }).then(r => r.data),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });
  const suggestion = suggestionData?.suggestion || null;

  useEffect(() => {
    if (open) {
      setMealType(defaultMealTypeForNow());
      setSelected(null);
      setQuantity(1);
      setLogged(false);
      setError('');
      setDescribeText('');
      setParsing(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const logMeal = useMutation({
    mutationFn: async (payload) => api.post('/meals', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: ['top-foods-quick'] });
      setLogged(true);
      setTimeout(() => { onClose(); }, 700);
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to log'),
  });

  const logBatch = useMutation({
    mutationFn: async (items) => {
      const localISO = nowLocalISO();
      await Promise.all(items.map(it => api.post('/meals', {
        meal_type: it.meal_type || mealType,
        name: it.name,
        calories: it.calories,
        logged_at: localISO,
        protein_g: it.protein_g ?? undefined,
        carbs_g: it.carbs_g ?? undefined,
        fat_g: it.fat_g ?? undefined,
      })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: ['top-foods-quick'] });
      setLogged(true);
      setTimeout(() => { onClose(); }, 800);
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to log'),
  });

  const logTemplate = useMutation({
    mutationFn: async (meal) => {
      const localISO = nowLocalISO();
      if (meal.is_template && meal.template_items) {
        await Promise.all(meal.template_items.map(item => api.post('/meals', {
          meal_type: meal.meal_type,
          name: item.name,
          calories: item.calories,
          logged_at: localISO,
          protein_g: item.protein_g ?? undefined,
          carbs_g: item.carbs_g ?? undefined,
          fat_g: item.fat_g ?? undefined,
        })));
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
      setLogged(true);
      setTimeout(() => { onClose(); }, 700);
    },
  });

  const handleQuickFood = (food) => {
    setError('');
    setSelected({
      name: food.name,
      baseCal: food.calories_per_serving ?? food.avg_calories ?? food.calories,
      baseProtein: food.protein_g ?? null,
      baseCarbs: food.carbs_g ?? null,
      baseFat: food.fat_g ?? null,
      serving_size: food.serving_size || null,
    });
    setQuantity(1);
  };

  const handleTopFoodLog = (f) => {
    if (logMeal.isPending) return;
    logMeal.mutate({
      meal_type: mealType,
      name: f.name,
      calories: f.avg_calories,
      logged_at: nowLocalISO(),
    });
  };

  const handleConfirmLog = () => {
    if (!selected) return;
    const cal = Math.round((selected.baseCal || 0) * quantity);
    if (!cal || cal <= 0) {
      setError('Calories required');
      return;
    }
    logMeal.mutate({
      meal_type: mealType,
      name: selected.name,
      calories: cal,
      logged_at: nowLocalISO(),
      protein_g: selected.baseProtein != null ? Math.round(selected.baseProtein * quantity * 10) / 10 : undefined,
      carbs_g: selected.baseCarbs != null ? Math.round(selected.baseCarbs * quantity * 10) / 10 : undefined,
      fat_g: selected.baseFat != null ? Math.round(selected.baseFat * quantity * 10) / 10 : undefined,
    });
  };

  const handleDescribe = async () => {
    const text = describeText.trim();
    if (!text || parsing) return;
    setError('');
    setParsing(true);
    try {
      const res = await api.post('/voice-log', { transcript: text, today: today() });
      const items = res.data.meals || [];
      if (items.length === 0) {
        setError("Couldn't find any food in that. Try something like \"two eggs and a banana\".");
        setParsing(false);
        return;
      }
      logBatch.mutate(items);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not parse that. Try a search instead.');
    } finally {
      setParsing(false);
    }
  };

  const previewCal = selected ? Math.round((selected.baseCal || 0) * quantity) : 0;
  const recentChips = useMemo(() => topFoods.slice(0, 6), [topFoods]);
  const isBusy = logMeal.isPending || logBatch.isPending || parsing;

  if (!open) return null;

  return (
    <>
      <div className="qls-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="qls-sheet" ref={sheetRef} role="dialog" aria-label="Quick log">
          <div className="qls-handle-bar" />
          <div className="qls-header">
            <div className="qls-title">Quick Log</div>
            <button className="qls-close" onClick={onClose} aria-label="Close">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {logged ? (
            <div className="qls-success">
              <div className="qls-success-circle">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div className="qls-success-text">Logged!</div>
            </div>
          ) : (
            <div className="qls-body">
              {/* Smart "same as usual" suggestion — fastest path */}
              {!selected && suggestion && (
                <button
                  className="qls-suggestion"
                  onClick={() => {
                    setMealType(suggestion.meal_type);
                    logMeal.mutate({
                      meal_type: suggestion.meal_type,
                      name: suggestion.name,
                      calories: suggestion.calories,
                      logged_at: nowLocalISO(),
                    });
                  }}
                  disabled={isBusy}
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

              <div className="qls-meal-type-row">
                {['breakfast', 'lunch', 'dinner', 'snack'].map(t => (
                  <button
                    key={t}
                    className={`qls-meal-pill${mealType === t ? ' active' : ''}`}
                    onClick={() => setMealType(t)}
                  >
                    <span style={{ textTransform: 'capitalize' }}>{t}</span>
                  </button>
                ))}
              </div>

              {error && <div className="error-message" style={{ marginBottom: '0.5rem' }}>{error}</div>}

              {selected ? (
                <div className="qls-confirm">
                  <div className="qls-confirm-name">{selected.name}</div>
                  {selected.serving_size && (
                    <div className="qls-confirm-serving">{selected.serving_size} · {selected.baseCal} cal each</div>
                  )}
                  <div className="qls-qty-row">
                    <button
                      className="qls-qty-btn"
                      onClick={() => setQuantity(q => Math.max(0.25, Math.round((q - 0.5) * 4) / 4))}
                      aria-label="Decrease quantity"
                    >−</button>
                    <div className="qls-qty-val">
                      <span className="qls-qty-num">{quantity}</span>
                      <span className="qls-qty-label">serving{quantity !== 1 ? 's' : ''}</span>
                    </div>
                    <button
                      className="qls-qty-btn"
                      onClick={() => setQuantity(q => Math.round((q + 0.5) * 4) / 4)}
                      aria-label="Increase quantity"
                    >+</button>
                  </div>
                  <div className="qls-preview-cal">{previewCal} cal</div>
                  <div className="qls-confirm-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => { setSelected(null); setQuantity(1); }}
                    >
                      Back
                    </button>
                    <button
                      className="btn btn-primary qls-confirm-log"
                      onClick={handleConfirmLog}
                      disabled={logMeal.isPending}
                    >
                      {logMeal.isPending ? 'Logging…' : `Log ${previewCal} cal`}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Top-row capture methods - the easiest paths */}
                  <div className="qls-methods">
                    <button
                      className="qls-method qls-method-photo"
                      onClick={() => setShowPhoto(true)}
                      disabled={isBusy}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                      </svg>
                      <span>Photo</span>
                    </button>
                    <button
                      className="qls-method qls-method-voice"
                      onClick={() => setShowVoice(true)}
                      disabled={isBusy}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                      <span>Voice</span>
                    </button>
                    <button
                      className="qls-method qls-method-scan"
                      onClick={() => setShowScan(true)}
                      disabled={isBusy}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 5V3h4"/><path d="M17 3h4v2"/><path d="M21 19v2h-4"/><path d="M7 21H3v-2"/><path d="M7 8v8"/><path d="M11 8v8"/><path d="M15 8v8"/><path d="M19 8v8"/>
                      </svg>
                      <span>Scan</span>
                    </button>
                  </div>

                  {/* Describe in plain text */}
                  <div className="qls-describe">
                    <input
                      type="text"
                      className="qls-describe-input"
                      placeholder="Or describe it: &quot;two eggs and toast&quot;"
                      value={describeText}
                      onChange={(e) => setDescribeText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleDescribe(); }}
                      disabled={isBusy}
                    />
                    <button
                      className="qls-describe-go"
                      onClick={handleDescribe}
                      disabled={isBusy || !describeText.trim()}
                      aria-label="Parse and log"
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
                  <div className="qls-search-wrap">
                    <FoodSearch onSelect={handleQuickFood} />
                  </div>

                  {/* Saved meals */}
                  {customMeals.length > 0 && (
                    <>
                      <div className="qls-section-label">Saved meals</div>
                      <div className="qls-chip-row">
                        {customMeals.slice(0, 8).map(m => (
                          <button
                            key={m.id}
                            className="qls-chip qls-chip-saved"
                            onClick={() => logTemplate.mutate(m)}
                            disabled={logTemplate.isPending}
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
                    </>
                  )}

                  {/* Frequent foods */}
                  {recentChips.length > 0 && (
                    <>
                      <div className="qls-section-label">Frequent · tap to log instantly</div>
                      <div className="qls-chip-row">
                        {recentChips.map(f => (
                          <button
                            key={f.name}
                            className="qls-chip qls-chip-recent"
                            onClick={() => handleTopFoodLog(f)}
                            disabled={logMeal.isPending}
                          >
                            <span className="qls-chip-name">{f.name}</span>
                            <span className="qls-chip-cal">{f.avg_calories}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {recentChips.length === 0 && customMeals.length === 0 && (
                    <div className="qls-empty">
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '0.6rem 0' }}>
                        Try a photo, voice, or just describe what you ate above.
                      </div>
                    </div>
                  )}

                  <button
                    className="qls-full-log"
                    onClick={() => { onClose(); navigate('/log'); }}
                  >
                    Open full logger (multi-item, macros, sharing)
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showPhoto && (
        <PhotoCapture
          onResults={(detected) => {
            setShowPhoto(false);
            const items = detected.map(d => ({
              meal_type: mealType,
              name: d.name,
              calories: d.calories,
              protein_g: d.protein_g,
              carbs_g: d.carbs_g,
              fat_g: d.fat_g,
            }));
            logBatch.mutate(items);
          }}
          onClose={() => setShowPhoto(false)}
        />
      )}

      {showVoice && (
        <VoiceLogger
          onSelect={(item) => {
            setShowVoice(false);
            handleQuickFood({
              name: item.name,
              calories_per_serving: item.calories,
              protein_g: item.protein_g,
              carbs_g: item.carbs_g,
              fat_g: item.fat_g,
            });
            if (item.meal_type) setMealType(item.meal_type);
          }}
          onClose={() => setShowVoice(false)}
        />
      )}

      {showScan && (
        <BarcodeScanner
          onResult={(food) => {
            setShowScan(false);
            handleQuickFood(food);
          }}
          onClose={() => setShowScan(false)}
        />
      )}
    </>
  );
}
