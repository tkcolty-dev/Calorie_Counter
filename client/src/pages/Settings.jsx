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

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  // Default matches main.jsx (light) so opening this page doesn't flip the
  // theme on first visit.
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
  });
  const [pushSupported] = useState(() => 'serviceWorker' in navigator && 'PushManager' in window);
  const [pushEnabled, setPushEnabled] = useState(() => {
    try { return Notification?.permission === 'granted'; } catch { return false; }
  });
  // FAB hint toggle — off by default
  const [fabHint, setFabHint] = useState(() => {
    try { return localStorage.getItem('fab-hint-enabled') === '1'; } catch { return false; }
  });
  const [resetHintConfirm, setResetHintConfirm] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  // Only persist the theme when the user actually changes it. Otherwise
  // first-visit users would have 'light' written to localStorage which is
  // fine, but this also avoids reapplying on every render.
  const initialThemeApplied = useRef(false);
  useEffect(() => {
    if (!initialThemeApplied.current) {
      initialThemeApplied.current = true;
      // Don't re-apply on mount if it matches what's already on the html element
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
        localStorage.setItem('fab-hint-seen', '1'); // suppress
      }
    } catch {}
  };

  const enablePush = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.register('/sw.js');
      const { data: { vapidPublicKey } } = await api.get('/notifications/vapid-key');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });
      await api.post('/notifications/subscribe', sub.toJSON());
      setPushEnabled(true);
    } catch {
      // ignore — UI stays unchanged on failure
    }
  };

  const resetTutorialHints = () => {
    try {
      localStorage.removeItem('tutorial-shown');
      localStorage.removeItem('fab-hint-seen');
      localStorage.removeItem('quick-actions-visible');
      // Also drop per-day auto-prompt keys
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('auto-prompt-')) localStorage.removeItem(k);
      });
    } catch {}
    setResetHintConfirm(true);
    setTimeout(() => setResetHintConfirm(false), 1800);
  };

  return (
    <div>
      <BackHeader title="Settings" subtitle="Theme, notifications, account" />

      <div className="card settings-section">
        <div className="settings-row-head">Appearance</div>
        <div className="settings-row">
          <div className="settings-row-label">Theme</div>
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

      <div className="card settings-section">
        <div className="settings-row-head">Notifications</div>
        <div className="settings-row">
          <div className="settings-row-label-block">
            <div className="settings-row-label">Meal reminders</div>
            <div className="settings-row-sub">A push at breakfast / lunch / dinner if you haven't logged yet.</div>
          </div>
          {pushSupported ? (
            <button
              className={`btn ${pushEnabled ? 'btn-secondary' : 'btn-primary'}`}
              onClick={enablePush}
              disabled={pushEnabled}
              style={{ flexShrink: 0 }}
            >
              {pushEnabled ? 'Enabled' : 'Enable'}
            </button>
          ) : (
            <span className="settings-row-sub" style={{ flexShrink: 0 }}>Not supported</span>
          )}
        </div>
      </div>

      <div className="card settings-section">
        <div className="settings-row-head">App</div>
        <div className="settings-row">
          <div className="settings-row-label-block">
            <div className="settings-row-label">Show floating "tap to log" hint</div>
            <div className="settings-row-sub">A bubble above the + button reminding you about hold-to-repeat. Off by default.</div>
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
        <button className="settings-action" onClick={resetTutorialHints}>
          <span>Replay onboarding hints</span>
          <span className="settings-action-sub">{resetHintConfirm ? 'Reset · refresh to see' : 'Welcome card, FAB hint, etc.'}</span>
        </button>
        <button className="settings-action" onClick={() => navigate('/preferences')}>
          <span>Food preferences</span>
          <span className="settings-action-sub">Cuisines, allergies, favorites</span>
        </button>
        <a className="settings-action" href="/api/refresh">
          <span>Force update</span>
          <span className="settings-action-sub">Clear local cache and load the latest app</span>
        </a>
      </div>

      <div className="card settings-section">
        <div className="settings-row-head">Account</div>
        {!logoutConfirm ? (
          <button className="settings-action settings-danger" onClick={() => setLogoutConfirm(true)}>
            <span>Sign out</span>
            <span className="settings-action-sub">You'll need to sign in again on next visit</span>
          </button>
        ) : (
          <div className="settings-confirm-row">
            <span>Sign out of this account?</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-danger" onClick={logout}>Sign out</button>
              <button className="btn btn-secondary" onClick={() => setLogoutConfirm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
