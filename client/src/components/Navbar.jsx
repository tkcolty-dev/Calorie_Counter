import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useNewShares } from '../hooks/useNewShares';
import { useNewMessages } from '../hooks/useNewMessages';
import MessageToast from './MessageToast';
import MealLoggedToast from './MealLoggedToast';
import QuickLogSheet from './QuickLogSheet';
import api from '../api/client';

function nowLocalISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:00`;
}

const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5"/>
      <rect x="14" y="3" width="7" height="5" rx="1.5"/>
      <rect x="14" y="12" width="7" height="9" rx="1.5"/>
      <rect x="3" y="16" width="7" height="5" rx="1.5"/>
    </svg>
  ),
  log: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
};

const tabs = [
  { to: '/', label: 'Dashboard', icon: Icon.dashboard },
  { to: '/log', label: 'Log', icon: Icon.log },
  { to: '/chat', label: 'Chat', icon: Icon.chat },
  { to: '/profile', label: 'Profile', icon: Icon.profile },
];

const badgeDot = {
  position: 'absolute',
  top: 2,
  right: 2,
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--color-danger)',
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { newCount } = useNewShares();
  const { latestMessage } = useNewMessages();
  const hasProfileBadge = newCount > 0;
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [fabFlash, setFabFlash] = useState(null); // 'success' | 'error' | null
  const [showFabHint, setShowFabHint] = useState(() => {
    try { return !localStorage.getItem('fab-hint-seen'); } catch { return false; }
  });
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const autoOpenedRef = useRef(false);
  // Hide FAB on the full log page (redundant) and on chat (covers chat input)
  const hideFab = location.pathname === '/log' || location.pathname === '/chat' || location.pathname.startsWith('/messages');

  // Auto-open the quick-log sheet on dashboard if it's near a meal time
  // and that meal hasn't been logged today, OR if the URL has ?quicklog=
  // (deep-link from a meal reminder push notification).
  const { data: autoSuggestion } = useQuery({
    queryKey: ['suggestion-autonag'],
    queryFn: () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return api.get('/suggestions', { params: { today: todayStr, hour: today.getHours() } }).then(r => r.data);
    },
    enabled: location.pathname === '/' && !showQuickLog,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (autoOpenedRef.current) return;

    // Path 1: deep-link from a push notification (?quicklog=lunch etc.)
    const params = new URLSearchParams(location.search);
    if (params.has('quicklog')) {
      autoOpenedRef.current = true;
      setShowQuickLog(true);
      // Clean the URL so a refresh doesn't keep popping it
      const cleaned = location.pathname + location.hash;
      window.history.replaceState({}, '', cleaned);
      return;
    }

    // Path 2: in-app auto-open near a meal time, once per meal-window per day
    if (location.pathname !== '/') return;
    if (!autoSuggestion?.suggestion) return;

    const now = new Date();
    const hour = now.getHours();
    const isMealWindow =
      (hour >= 8 && hour < 10) ||   // breakfast window
      (hour >= 12 && hour < 14) ||  // lunch window
      (hour >= 18 && hour < 20);    // dinner window
    if (!isMealWindow) return;

    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const seenKey = `auto-prompt-${dayKey}-${autoSuggestion.suggestion.meal_type}`;
    try {
      if (localStorage.getItem(seenKey)) return;
      localStorage.setItem(seenKey, '1');
    } catch {}

    autoOpenedRef.current = true;
    // Small delay so the dashboard renders first
    const t = setTimeout(() => setShowQuickLog(true), 800);
    return () => clearTimeout(t);
  }, [location.pathname, location.search, autoSuggestion, showQuickLog]);

  const repeatLastMeal = async () => {
    longPressFired.current = true;
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const res = await api.get('/meals/history', { params: { days: 3, today: todayStr } });
      const meals = res.data || [];
      if (meals.length === 0) {
        setFabFlash('error');
        setTimeout(() => setFabFlash(null), 1200);
        return;
      }
      const last = meals[0];
      const created = await api.post('/meals', {
        meal_type: last.meal_type,
        name: last.name,
        calories: last.calories,
        logged_at: nowLocalISO(),
        protein_g: last.protein_g ?? undefined,
        carbs_g: last.carbs_g ?? undefined,
        fat_g: last.fat_g ?? undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: ['top-foods-quick'] });
      queryClient.invalidateQueries({ queryKey: ['top-foods-dash'] });
      window.dispatchEvent(new CustomEvent('meal-logged-toast', {
        detail: {
          name: last.name,
          calories: last.calories,
          ids: created?.data?.id ? [created.data.id] : [],
        },
      }));
      setFabFlash('success');
      setTimeout(() => setFabFlash(null), 1200);
    } catch {
      setFabFlash('error');
      setTimeout(() => setFabFlash(null), 1200);
    }
  };

  const handleFabPressStart = (e) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(15);
      repeatLastMeal();
    }, 550);
  };

  const handleFabPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleFabClick = () => {
    // If long-press already fired, suppress click
    if (longPressFired.current) return;
    if (showFabHint) {
      try { localStorage.setItem('fab-hint-seen', '1'); } catch {}
      setShowFabHint(false);
    }
    setShowQuickLog(true);
  };

  return (
    <>
      {/* Desktop top nav */}
      <nav className="desktop-nav">
        <div className="desktop-nav-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span className="brand">Bitewise</span>
            <div className="desktop-links">
              {tabs.map(t => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.to === '/'}
                  className={({ isActive }) => `desktop-link${isActive ? ' active' : ''}`}
                  style={{ position: 'relative' }}
                >
                  {t.label}
                  {t.to === '/profile' && hasProfileBadge && <span style={badgeDot} />}
                </NavLink>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              {user?.username}
            </span>
            <button onClick={logout} className="desktop-link" style={{ background: 'none', border: 'none', color: 'var(--color-danger)' }}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="container app-main">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-tabs">
        {tabs.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `mobile-tab${isActive ? ' active' : ''}`}
            style={{ position: 'relative' }}
          >
            <span className="mobile-tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="mobile-tab-label">{t.label}</span>
            {t.to === '/profile' && hasProfileBadge && <span style={badgeDot} />}
          </NavLink>
        ))}
      </nav>

      <MessageToast message={latestMessage} onTap={() => navigate('/messages')} />
      <MealLoggedToast />

      {/* First-time hint about long-press */}
      {!hideFab && showFabHint && (
        <div className="fab-hint" onClick={() => { try { localStorage.setItem('fab-hint-seen', '1'); } catch {} setShowFabHint(false); }}>
          <span>Tap to log · <strong>Hold to repeat last meal</strong></span>
        </div>
      )}

      {/* Floating quick-log FAB - tap to open sheet, long-press to repeat last meal */}
      {!hideFab && (
        <button
          className={`fab-quicklog${fabFlash ? ` flash-${fabFlash}` : ''}`}
          onClick={handleFabClick}
          onMouseDown={handleFabPressStart}
          onMouseUp={handleFabPressEnd}
          onMouseLeave={handleFabPressEnd}
          onTouchStart={handleFabPressStart}
          onTouchEnd={handleFabPressEnd}
          onTouchCancel={handleFabPressEnd}
          aria-label="Quick log a meal — long-press to repeat last meal"
          title="Tap to log · Long-press to repeat last meal"
        >
          {fabFlash === 'success' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : fabFlash === 'error' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          )}
        </button>
      )}

      <QuickLogSheet open={showQuickLog} onClose={() => setShowQuickLog(false)} />
    </>
  );
}
