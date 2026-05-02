import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// Clean up old localStorage keys (now stored in DB)
localStorage.removeItem('msg-last-check');
localStorage.removeItem('seen-share-ids');
localStorage.removeItem('chat-history');

// Apply saved theme before render to prevent flash
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

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
