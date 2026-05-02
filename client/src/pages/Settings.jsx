import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import BackHeader from '../components/BackHeader';

const THEME_KEY = 'theme';
const themes = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

function applyTheme(value) {
  document.documentElement.setAttribute('data-theme', value);
}

const Chevron = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
  });
  const [pushSupported] = useState(() => 'serviceWorker' in navigator && 'PushManager' in window);
  const [pushPermission, setPushPermission] = useState(() => {
    try { return Notification?.permission || 'default'; } catch { return 'default'; }
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [fabHint, setFabHint] = useState(() => {
    try { return localStorage.getItem('fab-hint-enabled') === '1'; } catch { return false; }
  });
  const [resetMsg, setResetMsg] = useState('');
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  // Home-screen Quick Action visibility (default: 4 main buttons on)
  const HOME_BUTTON_KEY = 'home-buttons';
  const HOME_BUTTON_DEFAULTS = { reports: true, weight: true, goals: true, challenges: true, tasks: false, sharing: false, messages: false };
  const [homeButtons, setHomeButtons] = useState(() => {
    try {
      const raw = localStorage.getItem(HOME_BUTTON_KEY);
      return raw ? { ...HOME_BUTTON_DEFAULTS, ...JSON.parse(raw) } : HOME_BUTTON_DEFAULTS;
    } catch { return HOME_BUTTON_DEFAULTS; }
  });
  const toggleHomeButton = (id) => {
    const next = { ...homeButtons, [id]: !homeButtons[id] };
    setHomeButtons(next);
    try { localStorage.setItem(HOME_BUTTON_KEY, JSON.stringify(next)); } catch {}
    window.dispatchEvent(new CustomEvent('home-display-changed'));
  };

  // Misc dashboard display flags
  const useFlag = (key, def) => {
    const [v, setV] = useState(() => {
      try {
        const raw = localStorage.getItem(key);
        if (raw === '0') return false;
        if (raw === '1') return true;
      } catch {}
      return def;
    });
    const setAndPersist = (val) => {
      setV(val);
      try { localStorage.setItem(key, val ? '1' : '0'); } catch {}
      window.dispatchEvent(new CustomEvent('home-display-changed'));
    };
    return [v, setAndPersist];
  };
  const [showStreak, setShowStreak] = useFlag('show-streak', true);
  const [showSuggestionBanner, setShowSuggestionBanner] = useFlag('show-suggestion-banner', true);
  const [showWeeklySummary, setShowWeeklySummary] = useFlag('show-weekly-summary', true);
  const [showQuickActionsBar, setShowQuickActionsBar] = useFlag('show-quick-actions-bar', true);
  const [showPlanner, setShowPlanner] = useFlag('show-planner', true);

  const initialThemeApplied = useRef(false);
  useEffect(() => {
    if (!initialThemeApplied.current) {
      initialThemeApplied.current = true;
      const current = document.documentElement.getAttribute('data-theme');
      if (current === theme) return;
    }
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  const toggleFabHint = () => {
    const next = !fabHint;
    setFabHint(next);
    try {
      if (next) {
        localStorage.removeItem('fab-hint-seen');
        localStorage.setItem('fab-hint-enabled', '1');
      } else {
        localStorage.setItem('fab-hint-enabled', '0');
        localStorage.setItem('fab-hint-seen', '1');
      }
    } catch {}
  };

  const enablePush = async () => {
    setPushBusy(true);
    setPushError('');
    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm !== 'granted') {
        setPushError('Permission not granted. Enable notifications for this site in your browser settings.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const { data } = await api.get('/notifications/vapid-key');
      const vapidPublicKey = data?.vapidPublicKey || data?.publicKey || data;
      if (!vapidPublicKey) {
        setPushError('Server has no VAPID key configured.');
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });
      await api.post('/notifications/subscribe', sub.toJSON());
    } catch (err) {
      setPushError(err?.response?.data?.error || err?.message || 'Could not enable push.');
    } finally {
      setPushBusy(false);
    }
  };

  const resetTutorialHints = () => {
    try {
      localStorage.removeItem('tutorial-shown');
      localStorage.removeItem('fab-hint-seen');
      localStorage.removeItem('quick-actions-visible');
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('auto-prompt-')) localStorage.removeItem(k);
      });
    } catch {}
    setResetMsg('Hints reset · refresh to see them again');
    setTimeout(() => setResetMsg(''), 2200);
  };

  const [resetAllConfirm, setResetAllConfirm] = useState(false);
  const [resetAllMsg, setResetAllMsg] = useState('');

  const resetToDefaults = () => {
    try {
      // Drop every preference key we own — leaves the auth token alone.
      const keysToWipe = [
        'theme', 'fab-hint-enabled', 'fab-hint-seen', 'home-buttons',
        'show-streak', 'show-suggestion-banner', 'show-weekly-summary',
        'show-quick-actions-bar', 'show-planner',
        'tutorial-shown', 'quick-actions-visible',
        'weekly-summary-dismissed',
      ];
      // Also wipe per-section collapse keys and per-day auto-prompt keys
      Object.keys(localStorage).forEach(k => {
        if (
          keysToWipe.includes(k) ||
          k.startsWith('collapse-') ||
          k.startsWith('auto-prompt-')
        ) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
    // Re-sync state from the (now-empty) localStorage defaults
    setTheme('light');
    applyTheme('light');
    setFabHint(false);
    setHomeButtons(HOME_BUTTON_DEFAULTS);
    setShowStreak(true);
    setShowSuggestionBanner(true);
    setShowWeeklySummary(true);
    setShowQuickActionsBar(true);
    setShowPlanner(true);
    window.dispatchEvent(new CustomEvent('home-display-changed'));
    setResetAllConfirm(false);
    setResetAllMsg('All settings restored to defaults');
    setTimeout(() => setResetAllMsg(''), 2500);
  };

  return (
    <div>
      <BackHeader title="Settings" subtitle="Theme, notifications, account" />

      {/* Appearance */}
      <div className="settings-group">
        <div className="settings-group-head">Appearance</div>
        <div className="card settings-card">
          <div className="settings-item">
            <div className="settings-item-icon" style={{ color: '#3b82f6' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Theme</div>
              <div className="settings-item-sub">Choose how the app looks</div>
            </div>
            <div className="theme-toggle">
              {themes.map(t => (
                <button
                  key={t.id}
                  className={theme === t.id ? 'active' : ''}
                  onClick={() => setTheme(t.id)}
                >{t.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-group">
        <div className="settings-group-head">Notifications</div>
        <div className="card settings-card">
          <div className="settings-item">
            <div className="settings-item-icon" style={{ color: '#f59e0b' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Meal reminders</div>
              <div className="settings-item-sub">Push at breakfast / lunch / dinner if you haven't logged yet.</div>
              {pushError && <div className="settings-item-error">{pushError}</div>}
            </div>
            {pushSupported ? (
              <button
                className={`btn ${pushPermission === 'granted' ? 'btn-secondary' : 'btn-primary'}`}
                onClick={enablePush}
                disabled={pushPermission === 'granted' || pushBusy}
                style={{ flexShrink: 0, padding: '0.5rem 0.85rem' }}
              >
                {pushPermission === 'granted' ? 'Enabled' : pushBusy ? 'Enabling…' : 'Enable'}
              </button>
            ) : (
              <span className="settings-item-sub" style={{ flexShrink: 0 }}>Not supported</span>
            )}
          </div>
        </div>
      </div>

      {/* Home screen */}
      <div className="settings-group">
        <div className="settings-group-head">Home screen</div>
        <div className="card settings-card">
          <div className="settings-item">
            <div className="settings-item-icon" style={{ color: '#3b82f6' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Show shortcut bar</div>
              <div className="settings-item-sub">The icon row above your meals.</div>
            </div>
            <button type="button" role="switch" aria-checked={showQuickActionsBar} className={`settings-toggle${showQuickActionsBar ? ' on' : ''}`} onClick={() => setShowQuickActionsBar(!showQuickActionsBar)}>
              <span className="settings-toggle-knob" />
            </button>
          </div>
          {showQuickActionsBar && [
            { id: 'reports', label: 'Reports', desc: 'Trends, streaks, charts' },
            { id: 'weight', label: 'Weight', desc: 'Weight log over time' },
            { id: 'goals', label: 'Goals', desc: 'Calorie & macro targets' },
            { id: 'challenges', label: 'Challenges', desc: 'Streaks vs friends' },
            { id: 'tasks', label: 'Tasks', desc: 'Reminders that nag' },
            { id: 'sharing', label: 'Sharing', desc: 'Friends and groups' },
            { id: 'messages', label: 'Messages', desc: 'Chat with sharers' },
          ].map(b => (
            <div className="settings-item" key={b.id}>
              <div className="settings-item-icon" style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem', fontWeight: 700 }}>
                <span style={{ fontSize: '0.85rem' }}>{b.label[0]}</span>
              </div>
              <div className="settings-item-text">
                <div className="settings-item-label">{b.label}</div>
                <div className="settings-item-sub">{b.desc}</div>
              </div>
              <button type="button" role="switch" aria-checked={!!homeButtons[b.id]} className={`settings-toggle${homeButtons[b.id] ? ' on' : ''}`} onClick={() => toggleHomeButton(b.id)}>
                <span className="settings-toggle-knob" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Dashboard cards */}
      <div className="settings-group">
        <div className="settings-group-head">Dashboard cards</div>
        <div className="card settings-card">
          <div className="settings-item">
            <div className="settings-item-icon" style={{ color: '#0ea5e9' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Planner</div>
              <div className="settings-item-sub">Week strip + planned meals card.</div>
            </div>
            <button type="button" role="switch" aria-checked={showPlanner} className={`settings-toggle${showPlanner ? ' on' : ''}`} onClick={() => setShowPlanner(!showPlanner)}>
              <span className="settings-toggle-knob" />
            </button>
          </div>
          <div className="settings-item">
            <div className="settings-item-icon" style={{ color: '#f97316' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Streak chip</div>
              <div className="settings-item-sub">Orange "X days" badge by your name.</div>
            </div>
            <button type="button" role="switch" aria-checked={showStreak} className={`settings-toggle${showStreak ? ' on' : ''}`} onClick={() => setShowStreak(!showStreak)}>
              <span className="settings-toggle-knob" />
            </button>
          </div>
          <div className="settings-item">
            <div className="settings-item-icon" style={{ color: '#8b5cf6' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">"Your usual" suggestion</div>
              <div className="settings-item-sub">One-tap log banner at meal times.</div>
            </div>
            <button type="button" role="switch" aria-checked={showSuggestionBanner} className={`settings-toggle${showSuggestionBanner ? ' on' : ''}`} onClick={() => setShowSuggestionBanner(!showSuggestionBanner)}>
              <span className="settings-toggle-knob" />
            </button>
          </div>
          <div className="settings-item">
            <div className="settings-item-icon" style={{ color: '#16a34a' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11h18l-2 9H5l-2-9z"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Weekly AI summary</div>
              <div className="settings-item-sub">Last week's recap once a week.</div>
            </div>
            <button type="button" role="switch" aria-checked={showWeeklySummary} className={`settings-toggle${showWeeklySummary ? ' on' : ''}`} onClick={() => setShowWeeklySummary(!showWeeklySummary)}>
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </div>

      {/* App */}
      <div className="settings-group">
        <div className="settings-group-head">App</div>
        <div className="card settings-card">
          <div className="settings-item">
            <div className="settings-item-icon" style={{ color: '#8b5cf6' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Floating "tap to log" hint</div>
              <div className="settings-item-sub">Bubble above the + button reminding you to hold-to-repeat.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={fabHint}
              className={`settings-toggle${fabHint ? ' on' : ''}`}
              onClick={toggleFabHint}
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>

          <button className="settings-link-row" onClick={resetTutorialHints}>
            <div className="settings-item-icon" style={{ color: '#16a34a' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 4 3 10 9 10"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Replay onboarding hints</div>
              <div className="settings-item-sub">{resetMsg || 'Welcome card, FAB hint, auto-prompt'}</div>
            </div>
            <span className="settings-link-chevron">{Chevron}</span>
          </button>

          <button className="settings-link-row" onClick={() => navigate('/preferences')}>
            <div className="settings-item-icon" style={{ color: '#ec4899' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Food preferences</div>
              <div className="settings-item-sub">Cuisines, allergies, favorites</div>
            </div>
            <span className="settings-link-chevron">{Chevron}</span>
          </button>

          <a className="settings-link-row" href="/api/refresh">
            <div className="settings-item-icon" style={{ color: '#0ea5e9' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
            </div>
            <div className="settings-item-text">
              <div className="settings-item-label">Force update</div>
              <div className="settings-item-sub">Clear local cache and load the latest app</div>
            </div>
            <span className="settings-link-chevron">{Chevron}</span>
          </a>

          {!resetAllConfirm ? (
            <button className="settings-link-row" onClick={() => setResetAllConfirm(true)}>
              <div className="settings-item-icon" style={{ color: 'var(--color-warning)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 4 3 10 9 10"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
              </div>
              <div className="settings-item-text">
                <div className="settings-item-label">Reset all settings</div>
                <div className="settings-item-sub">{resetAllMsg || 'Restore every preference to its default'}</div>
              </div>
              <span className="settings-link-chevron">{Chevron}</span>
            </button>
          ) : (
            <div className="settings-confirm-block">
              <div className="settings-item-text" style={{ marginBottom: '0.65rem' }}>
                <div className="settings-item-label">Reset every setting to default?</div>
                <div className="settings-item-sub">Theme, home-screen buttons, dashboard cards, hints — all back to factory. Your meals, goals, and account stay.</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={resetToDefaults} style={{ flex: 1 }}>Reset</button>
                <button className="btn btn-secondary" onClick={() => setResetAllConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account */}
      <div className="settings-group">
        <div className="settings-group-head">Account</div>
        <div className="card settings-card">
          {!logoutConfirm ? (
            <button className="settings-link-row settings-danger" onClick={() => setLogoutConfirm(true)}>
              <div className="settings-item-icon" style={{ color: 'var(--color-danger)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </div>
              <div className="settings-item-text">
                <div className="settings-item-label">Sign out</div>
                <div className="settings-item-sub">You'll need to sign in again next visit</div>
              </div>
              <span className="settings-link-chevron">{Chevron}</span>
            </button>
          ) : (
            <div className="settings-confirm-block">
              <div className="settings-item-text" style={{ marginBottom: '0.65rem' }}>
                <div className="settings-item-label">Sign out of this account?</div>
                <div className="settings-item-sub">You'll need to sign back in to use the app.</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-danger" onClick={logout} style={{ flex: 1 }}>Sign out</button>
                <button className="btn btn-secondary" onClick={() => setLogoutConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
