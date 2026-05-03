import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import CalorieBudgetBar from '../components/CalorieBudgetBar';
import MealTable from '../components/MealTable';
import WeekStrip from '../components/WeekStrip';
import PlannedMealsList from '../components/PlannedMealsList';
import PlanMealForm from '../components/PlanMealForm';
import WelcomeTutorial from '../components/WelcomeTutorial';
import { useAuth } from '../context/AuthContext';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Welcome back';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const HOME_BUTTON_DEFAULTS = { reports: true, weight: true, goals: true, challenges: true, tasks: false, sharing: false, messages: false };

function readHomeButtons() {
  try {
    const raw = localStorage.getItem('home-buttons');
    return raw ? { ...HOME_BUTTON_DEFAULTS, ...JSON.parse(raw) } : HOME_BUTTON_DEFAULTS;
  } catch { return HOME_BUTTON_DEFAULTS; }
}

function readFlag(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {}
  return def;
}

function CollapsibleSection({ title, subtitle, defaultOpen = false, children, actions }) {
  const storageKey = `collapse-${title}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch {}
    return defaultOpen;
  });
  const setOpenPersist = (val) => {
    setOpen(val);
    try { localStorage.setItem(storageKey, val ? '1' : '0'); } catch {}
  };

  return (
    <div className={`collapsible-section${open ? ' is-open' : ''}`}>
      <button className="collapsible-header" onClick={() => setOpenPersist(!open)}>
        <div className="collapsible-title-row">
          <div>
            <span className="collapsible-title">{title}</span>
            {subtitle && <span className="collapsible-subtitle">{subtitle}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {actions && open && <div onClick={e => e.stopPropagation()}>{actions}</div>}
            <span className={`collapsible-chevron ${open ? 'open' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </div>
        </div>
      </button>
      <div className={`collapsible-content${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="collapsible-content-inner">
          {children}
        </div>
      </div>
    </div>
  );
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Home-screen display settings (synced with Settings page)
  const [homeButtons, setHomeButtons] = useState(readHomeButtons);
  const [showStreak, setShowStreak] = useState(() => readFlag('show-streak', true));
  const [showSuggestionBanner, setShowSuggestionBanner] = useState(() => readFlag('show-suggestion-banner', true));
  const [showWeeklySummary, setShowWeeklySummary] = useState(() => readFlag('show-weekly-summary', true));
  const [showQuickActionsBar, setShowQuickActionsBar] = useState(() => readFlag('show-quick-actions-bar', true));
  const [showPlanner, setShowPlanner] = useState(() => readFlag('show-planner', true));

  useEffect(() => {
    const onChange = () => {
      setHomeButtons(readHomeButtons());
      setShowStreak(readFlag('show-streak', true));
      setShowSuggestionBanner(readFlag('show-suggestion-banner', true));
      setShowWeeklySummary(readFlag('show-weekly-summary', true));
      setShowQuickActionsBar(readFlag('show-quick-actions-bar', true));
      setShowPlanner(readFlag('show-planner', true));
    };
    window.addEventListener('home-display-changed', onChange);
    return () => window.removeEventListener('home-display-changed', onChange);
  }, []);

  const now = new Date();
  const today = formatDate(now);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Dismissed-suggestion is persisted per-day so closing it sticks across
  // reloads; resets naturally tomorrow when the suggestion changes anyway.
  const dismissedSuggestionKey = `dismissed-suggestion-${today}`;
  const [dismissedSuggestion, setDismissedSuggestionState] = useState(() => {
    try { return localStorage.getItem(dismissedSuggestionKey) === '1'; } catch { return false; }
  });
  const setDismissedSuggestion = (val) => {
    setDismissedSuggestionState(val);
    try {
      if (val) localStorage.setItem(dismissedSuggestionKey, '1');
      else localStorage.removeItem(dismissedSuggestionKey);
    } catch {}
  };
  const [showQuickActions, setShowQuickActions] = useState(() => localStorage.getItem('quick-actions-visible') !== 'false');
  const [dismissedWeekly, setDismissedWeekly] = useState(() => {
    const saved = localStorage.getItem('weekly-summary-dismissed');
    if (!saved) return null;
    const { weekOf } = JSON.parse(saved);
    // Allow showing again after a week
    const d = new Date(weekOf + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0] > today ? weekOf : null;
  });

  const { data: meals = [], isLoading: mealsLoading } = useQuery({
    queryKey: ['meals', today],
    queryFn: () => api.get('/meals', { params: { date: today } }).then(r => r.data),
  });

  const { data: goals } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then(r => r.data),
  });

  const { data: historyMeals = [] } = useQuery({
    queryKey: ['meals-history', today],
    queryFn: () => api.get('/meals/history', { params: { days: 7, today } }).then(r => r.data),
  });

  const { data: suggestionData } = useQuery({
    queryKey: ['suggestion', today],
    queryFn: () => api.get('/suggestions', { params: { today, hour: new Date().getHours() } }).then(r => r.data),
  });

  const { data: weeklySummary } = useQuery({
    queryKey: ['weekly-summary'],
    queryFn: () => api.get('/reports/weekly-summary', { params: { today } }).then(r => r.data),
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const { data: streakData } = useQuery({
    queryKey: ['streaks', today],
    queryFn: () => api.get('/reports/streaks', { params: { today } }).then(r => r.data),
    staleTime: 1000 * 60 * 10,
  });

  const { data: topFoods = [] } = useQuery({
    queryKey: ['top-foods-dash', today],
    queryFn: () => api.get('/meals/top-foods', { params: { days: 30, today } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });

  const quickLogTopFood = useMutation({
    mutationFn: async (food) => {
      const n = new Date();
      const localISO = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
      const h = n.getHours();
      const meal_type = h >= 4 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 17 && h < 22 ? 'dinner' : 'snack';
      const created = await api.post('/meals', {
        meal_type,
        name: food.name,
        calories: food.avg_calories,
        logged_at: localISO,
      });
      return { food, created };
    },
    onSuccess: ({ food, created }) => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: ['top-foods-dash'] });
      window.dispatchEvent(new CustomEvent('meal-logged-toast', {
        detail: { name: food.name, calories: food.avg_calories, ids: created?.data?.id ? [created.data.id] : [] },
      }));
    },
  });

  // Compute the visible week range for planned meals query
  const weekRange = useMemo(() => {
    const sel = new Date(selectedDate + 'T12:00:00');
    const dow = sel.getDay();
    const start = new Date(sel);
    start.setDate(start.getDate() - dow);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: formatDate(start), to: formatDate(end) };
  }, [selectedDate]);

  const { data: plannedMeals = [] } = useQuery({
    queryKey: ['planned-meals', weekRange.from, weekRange.to],
    queryFn: () => api.get('/planned-meals', { params: weekRange }).then(r => r.data),
  });

  const datesWithPlans = useMemo(() => {
    const s = new Set();
    plannedMeals.forEach((m) => {
      const d = typeof m.planned_date === 'string' ? m.planned_date.split('T')[0] : m.planned_date;
      s.add(d);
    });
    return s;
  }, [plannedMeals]);

  const selectedDayPlans = plannedMeals.filter((m) => {
    const d = typeof m.planned_date === 'string' ? m.planned_date.split('T')[0] : m.planned_date;
    return d === selectedDate;
  });

  const logPlannedMeal = useMutation({
    mutationFn: (meal) => {
      const n = new Date();
      const localISO = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
      return api.post(`/planned-meals/${meal.id}/log`, { logged_at: localISO });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-meals'] });
      queryClient.invalidateQueries({ queryKey: ['meals'] });
    },
  });

  const deletePlannedMeal = useMutation({
    mutationFn: (id) => api.delete(`/planned-meals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['planned-meals'] }),
  });

  const deleteMeal = useMutation({
    mutationFn: (id) => api.delete(`/meals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meals'] }),
  });

  const editMeal = useMutation({
    mutationFn: ({ id, updates }) => api.put(`/meals/${id}`, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meals'] }),
  });

  const clearToday = useMutation({
    mutationFn: () => api.delete('/meals/today', { params: { today } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meals'] }),
  });

  const copyDay = useMutation({
    mutationFn: (from_date) => api.post('/meals/copy-day', { from_date, to_date: today }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meals'] }),
  });

  const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);
  const macroTotals = {
    protein: meals.reduce((sum, m) => sum + (parseFloat(m.protein_g) || 0), 0),
    carbs: meals.reduce((sum, m) => sum + (parseFloat(m.carbs_g) || 0), 0),
    fat: meals.reduce((sum, m) => sum + (parseFloat(m.fat_g) || 0), 0),
  };
  const macroGoals = goals ? {
    protein: parseFloat(goals.protein_goal_g) || 0,
    carbs: parseFloat(goals.carbs_goal_g) || 0,
    fat: parseFloat(goals.fat_goal_g) || 0,
  } : null;
  const dailyGoal = goals?.daily_total || 2000;

  // Group history meals by date
  const historyByDate = historyMeals.reduce((acc, meal) => {
    const date = new Date(meal.logged_at).toISOString().split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(meal);
    return acc;
  }, {});

  return (
    <div>
      <WelcomeTutorial />
      <div className="dash-greeting">
        <div className="dash-greeting-text">
          <h1>{greeting()}{user?.username ? `, ${user.username}` : ''}</h1>
          <p>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        {showStreak && streakData?.currentStreak > 0 && (
          <Link to="/reports" className="streak-chip" title={`Longest: ${streakData.longestStreak} days`} style={{ textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13.5 1c-1.6 4-4 4.7-4 8 0 1.5 1 3 2.5 3-1 0-2 1-2 2.5 0 1 .5 2 1 2.5-3-1-6-3.5-6-8C5 5 9 2 13.5 1zm3 7c.5 2 3 2.5 3 6 0 4-3 7-7.5 8 1.5-1 2-2.5 2-4 0-1-.5-1.5-1-2 1 0 1.5-.5 1.5-1.5 0-2.5-2-3-2-4.5 0-.7.6-1.6 4-2z"/></svg>
            {streakData.currentStreak} day{streakData.currentStreak !== 1 ? 's' : ''}
          </Link>
        )}
      </div>

      <div className="card" style={{ marginBottom: '0.75rem', padding: '0.6rem 0.75rem' }}>
        <CalorieBudgetBar consumed={totalCalories} goal={dailyGoal} macros={macroTotals} macroGoals={macroGoals} />
      </div>

      {/* Frequent-foods chips removed — the Log page and FAB sheet handle this */}

      {/* Pending tasks */}
      <DashboardTasks />

      {/* Quick actions toggle + grid */}
      <button
        className="quick-actions-toggle"
        onClick={() => {
          const next = !showQuickActions;
          setShowQuickActions(next);
          localStorage.setItem('quick-actions-visible', String(next));
        }}
      >
        <span>Quick Actions</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={showQuickActions ? 'rotated' : ''}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {showQuickActions && showQuickActionsBar && (() => {
        const buttonDefs = [
          { id: 'reports', to: '/reports', label: 'Reports', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg> },
          { id: 'weight', to: '/weight', label: 'Weight', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"/><path d="M3 12h18"/><path d="M16 7l-4-4-4 4"/><path d="M8 17l4 4 4-4"/></svg> },
          { id: 'goals', to: '/goals', label: 'Goals', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
          { id: 'challenges', to: '/challenges', label: 'Challenges', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
          { id: 'tasks', to: '/tasks', label: 'Tasks', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
          { id: 'sharing', to: '/sharing', label: 'Sharing', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
          { id: 'messages', to: '/messages', label: 'Messages', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
        ];
        const visible = buttonDefs.filter(b => homeButtons[b.id]);
        if (visible.length === 0) return null;
        const cols = Math.min(visible.length, 4);
        return (
          <div className="quick-actions-bar" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {visible.map(b => (
              <Link key={b.id} to={b.to} className="qa-bar-btn" title={b.label}>
                <span className="qa-bar-icon">{b.svg}</span>
                <span className="qa-bar-label">{b.label}</span>
              </Link>
            ))}
          </div>
        );
      })()}

      {/* Smart suggestion banner */}
      {showSuggestionBanner && suggestionData?.suggestion && !dismissedSuggestion && (
        <div className="card" style={{ marginBottom: '1rem', background: 'color-mix(in srgb, var(--color-primary) 5%, var(--color-surface))', border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem' }}>{suggestionData.suggestion.message}</div>
            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                onClick={() => {
                  const s = suggestionData.suggestion;
                  const n = new Date();
                  const localISO = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
                  api.post('/meals', { meal_type: s.meal_type, name: s.name, calories: s.calories, logged_at: localISO })
                    .then(() => { queryClient.invalidateQueries({ queryKey: ['meals'] }); setDismissedSuggestion(true); });
                }}
              >
                Log it
              </button>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => setDismissedSuggestion(true)}>
                &times;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly AI summary */}
      {showWeeklySummary && weeklySummary?.summary && dismissedWeekly !== weeklySummary.summary.weekOf && (
        <div className="card" style={{ marginBottom: '1rem', background: 'color-mix(in srgb, var(--color-success) 5%, var(--color-surface))', border: '1px solid color-mix(in srgb, var(--color-success) 20%, transparent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Weekly Summary</div>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{weeklySummary.summary.text}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.3rem' }}>
                {weeklySummary.summary.daysLogged}/7 days logged &middot; {weeklySummary.summary.avgCal} cal/day avg
              </div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', flexShrink: 0 }}
              onClick={() => {
                setDismissedWeekly(weeklySummary.summary.weekOf);
                localStorage.setItem('weekly-summary-dismissed', JSON.stringify({ weekOf: weeklySummary.summary.weekOf }));
              }}
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {showPlanner && (
      <CollapsibleSection title="Planner" subtitle={selectedDayPlans.length > 0 ? `${selectedDayPlans.length} planned` : ''} defaultOpen>
        <div style={{ padding: '0.75rem' }}>
          <WeekStrip
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            datesWithPlans={datesWithPlans}
          />
        </div>
        {selectedDayPlans.length > 0 && (
          <div style={{ padding: '0 0.75rem 0.75rem' }}>
            <PlannedMealsList
              plannedMeals={selectedDayPlans}
              onLog={(meal) => logPlannedMeal.mutate(meal)}
              onDelete={(id) => deletePlannedMeal.mutate(id)}
              canLog={selectedDate <= today}
            />
          </div>
        )}
      </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Meals"
        subtitle={meals.length > 0 ? `${totalCalories} cal` : ''}
        defaultOpen
        actions={
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setShowPlanForm(true)}>+ Plan</button>
            <Link to="/log" className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>+ Log</Link>
          </div>
        }
      >
        {meals.length > 0 && !confirmClear && (
          <div style={{ textAlign: 'right', padding: '0 0.75rem', marginBottom: '-0.25rem' }}>
            <button
              className="btn"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: 'var(--color-text-secondary)', border: 'none', background: 'none', textDecoration: 'underline' }}
              onClick={() => {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 4000);
              }}
            >
              Clear all meals
            </button>
          </div>
        )}
        {confirmClear && (
          <div style={{ padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>Delete all today's meals?</span>
            <button
              className="btn btn-danger"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
              onClick={() => { clearToday.mutate(); setConfirmClear(false); }}
              disabled={clearToday.isPending}
            >
              Yes, clear
            </button>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
          </div>
        )}

        {showPlanForm && (
          <PlanMealForm
            date={selectedDate}
            onClose={() => setShowPlanForm(false)}
            onSuccess={() => setShowPlanForm(false)}
          />
        )}

        <div style={{ padding: '0.5rem 0.75rem 0.75rem' }}>
          {mealsLoading ? (
            <div className="loading">Loading meals...</div>
          ) : meals.length === 0 ? (
            <div className="meal-empty-state" style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              <p>Nothing logged yet — let's fix that.</p>
              <Link to="/log" className="btn btn-primary meal-empty-cta">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Log a meal
              </Link>
            </div>
          ) : (
            <MealTable
              meals={meals}
              onDelete={(id) => deleteMeal.mutate(id)}
              onEdit={(id, updates) => editMeal.mutate({ id, updates })}
            />
          )}
        </div>
      </CollapsibleSection>

      {Object.keys(historyByDate).length > 0 && (
        <CollapsibleSection title="Recent History" subtitle="Last 7 days">
          <div style={{ padding: '0.5rem 0.75rem 0.75rem' }}>
            {Object.entries(historyByDate)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, dateMeals]) => (
                <HistoryDateSection key={date} date={date} meals={dateMeals} onCopyToToday={(d) => copyDay.mutate(d)} />
              ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function DashboardTasks() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['tasks-pending'],
    queryFn: () => api.get('/tasks?status=pending').then(r => r.data),
  });

  const toggleComplete = useMutation({
    mutationFn: (id) => api.patch(`/tasks/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-pending'] });
    },
  });

  const tasks = data?.tasks || [];
  if (tasks.length === 0) return null;

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Tasks ({tasks.length})
        </span>
        <Link to="/tasks" style={{ fontSize: '0.75rem' }}>View all</Link>
      </div>
      {tasks.slice(0, 3).map(task => {
        const isOverdue = new Date(task.due_at) < new Date();
        const time = new Date(task.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return (
          <div
            key={task.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.6rem',
              background: 'var(--color-surface)',
              borderRadius: 8,
              marginBottom: '0.3rem',
              borderLeft: `3px solid ${isOverdue ? 'var(--color-danger)' : 'var(--color-primary)'}`,
            }}
          >
            <button
              onClick={() => toggleComplete.mutate(task.id)}
              style={{
                flexShrink: 0, width: 20, height: 20, borderRadius: 5,
                border: '2px solid var(--color-border)', background: 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            />
            <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.title}
            </span>
            <span style={{ fontSize: '0.7rem', color: isOverdue ? 'var(--color-danger)' : 'var(--color-text-secondary)', flexShrink: 0 }}>
              {time}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HistoryDateSection({ date, meals, onCopyToToday }) {
  const [open, setOpen] = useState(false);
  const total = meals.reduce((sum, m) => sum + m.calories, 0);
  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <div className="history-date-group">
      <button className="history-date-header" onClick={() => setOpen(!open)}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600 }}>{total} cal</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            {meals.length} meal{meals.length !== 1 ? 's' : ''} {open ? '▲' : '▼'}
          </span>
        </span>
      </button>
      {open && (
        <div className="history-rows">
          {meals.map((m) => (
            <div key={m.id} className="history-row">
              <span className="history-row-name">{m.name}</span>
              <span className="history-row-cal">{m.calories} cal</span>
            </div>
          ))}
          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', margin: '0.4rem 0.5rem' }}
            onClick={(e) => { e.stopPropagation(); onCopyToToday(date); }}
          >
            Copy to today
          </button>
        </div>
      )}
    </div>
  );
}
