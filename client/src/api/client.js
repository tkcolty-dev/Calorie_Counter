import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// In-memory fallback for when localStorage is unavailable (Safari private mode, quota errors).
// AuthContext keeps this in sync via setAuthToken().
let memToken = null;
export function setAuthToken(token) {
  memToken = token;
}

function readToken() {
  if (memToken) return memToken;
  try { return localStorage.getItem('token'); } catch { return null; }
}

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Build-version mismatch detector. If the server reports a different build
// than the one baked into this JS bundle, the client is stale (cached HTML
// and JS got served somehow) — force a full cache wipe and reload exactly
// once. This is the killer for Safari's stubborn HTML caching: API responses
// are never SW-intercepted, so the X-App-Version header reaches us fresh
// even when index.html does not.
function maybeForceRefresh(serverVersion) {
  if (!serverVersion) return;
  const myVersion = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null;
  if (!myVersion || serverVersion === myVersion) return;
  try {
    if (sessionStorage.getItem('bw-refresh-attempted') === '1') return;
    sessionStorage.setItem('bw-refresh-attempted', '1');
  } catch {}
  // Tiny delay so any in-flight requests settle before we navigate
  setTimeout(() => {
    window.location.replace('/api/refresh');
  }, 50);
}

api.interceptors.response.use(
  (response) => {
    maybeForceRefresh(response.headers?.['x-app-version']);
    return response;
  },
  (error) => {
    maybeForceRefresh(error.response?.headers?.['x-app-version']);
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/register');
      const onLoginPage = window.location.pathname === '/login' || window.location.pathname === '/register';
      if (!isAuthAttempt && !onLoginPage) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
