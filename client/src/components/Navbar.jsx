import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNewShares } from '../hooks/useNewShares';
import { useNewMessages } from '../hooks/useNewMessages';
import MessageToast from './MessageToast';

const tabs = [
  { to: '/', label: 'Dashboard', icon: '□' },
  { to: '/log', label: 'Log', icon: '+' },
  { to: '/chat', label: 'Chat', icon: '◯' },
  { to: '/profile', label: 'Profile', icon: '⚙' },
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
  const { newCount } = useNewShares();
  const { latestMessage } = useNewMessages();
  const hasProfileBadge = newCount > 0;

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
            <span className="mobile-tab-icon">{t.icon}</span>
            <span className="mobile-tab-label">{t.label}</span>
            {t.to === '/profile' && hasProfileBadge && <span style={badgeDot} />}
          </NavLink>
        ))}
      </nav>

      <MessageToast message={latestMessage} onTap={() => navigate('/messages')} />
    </>
  );
}
