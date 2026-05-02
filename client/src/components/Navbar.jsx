import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useNewShares } from '../hooks/useNewShares';
import { useNewMessages } from '../hooks/useNewMessages';
import MessageToast from './MessageToast';
import MealLoggedToast from './MealLoggedToast';
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
  const [fabFlash, setFabFlash] = useState(null); // 'success' | 'error' | null
  // Hint is OFF by default; user can opt-in via Settings.
  const [showFabHint, setShowFabHint] = useState(() => {
    try {
      return localStorage.getItem('fab-hint-enabled') === '1'
        && !localStorage.getItem('fab-hint-seen');
    } catch { return false; }
  });
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const autoOpenedRef = useRef(false);
  // Hide FAB on the full log page (redundant) and on chat (covers chat input)
  const hideFab = location.pathname === '/log' || location.pathname === '/chat' || location.pathname.startsWith('/messages');

  // Push-notification deep-link: ?quicklog=lunch sends user to /log.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    const params = new URLSearchParams(location.search);
    if (params.has('quicklog')) {
      autoOpenedRef.current = true;
      const cleaned = location.pathname + location.hash;
      window.history.replaceState({}, '', cleaned);
      navigate('/log');
    }
  }, [location.pathname, location.search, navigate]);

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
    navigate('/log');
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

      {/* Main content — keyed on the route so React unmounts/remounts the page
          and our CSS animation runs every time the user switches tabs. */}
      <main className="container app-main">
        <div key={location.pathname} className="route-fade">
          <Outlet />
        </div>
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

    </>
  );
}
