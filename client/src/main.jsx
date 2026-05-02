import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// Clean up old localStorage keys (now stored in DB)
localStorage.removeItem('msg-last-check');
localStorage.removeItem('seen-share-ids');
localStorage.removeItem('chat-history');

// Apply saved theme + density flags before render to prevent flash
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
if (localStorage.getItem('compact-ui') === '1') document.documentElement.classList.add('ui-compact');
if (localStorage.getItem('large-text') === '1') document.documentElement.classList.add('ui-large-text');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Build-version probe — runs immediately on app boot. If the server is on a
// newer build than the cached/baked-in client (common in Safari which holds
// onto HTML aggressively), the response interceptor in api/client.js will
// see the mismatch via X-App-Version and redirect to /api/refresh.
import('./api/client').then(({ default: api }) => {
  api.get('/version').catch(() => {});
}).catch(() => {});

// Pull saved settings from the server so a returning user gets the same
// theme / home-screen layout / dashboard toggles on every device. No-op
// if not authenticated yet; AuthContext re-triggers it on login.
import('./api/userSettings').then(({ syncSettingsFromServer }) => {
  syncSettingsFromServer();
}).catch(() => {});

// Register service worker for push notifications + auto-reload when a new
// version of the SW activates (so app updates roll out without users having
// to manually clear cache).
if ('serviceWorker' in navigator) {
  let didReload = false;
  // When a new SW takes control, reload the page once so the new asset
  // bundles are picked up.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (didReload) return;
    didReload = true;
    window.location.reload();
  });
  // Custom message from the SW after it activates.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'SW_UPDATED' && !didReload) {
      didReload = true;
      window.location.reload();
    }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Periodically check for updates while the tab is open
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
