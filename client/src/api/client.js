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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      const isAuthAttempt = url.includes('/auth/login') || url.includes('/auth/register');
      const onLoginPage = window.location.pathname === '/login' || window.location.pathname === '/register';
      // Don't redirect on the login/register call itself, or if already on the login page —
      // that would wipe the error message before the user could see it.
      if (!isAuthAttempt && !onLoginPage) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
