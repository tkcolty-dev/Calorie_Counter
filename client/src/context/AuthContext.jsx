import { createContext, useContext, useState, useEffect } from 'react';
import api, { setAuthToken } from '../api/client';

const AuthContext = createContext(null);

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch { /* private mode / quota — fall back to in-memory token in api/client */ }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = safeGet('token');
    if (token) {
      setAuthToken(token);
      api.get('/auth/me')
        .then(res => setUser(res.data.user))
        .catch(() => { safeRemove('token'); setAuthToken(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    safeSet('token', res.data.token);
    setAuthToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (username, password, captchaAnswer, captchaToken) => {
    const res = await api.post('/auth/register', { username, password, captchaAnswer, captchaToken });
    safeSet('token', res.data.token);
    setAuthToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const completeOnboarding = async () => {
    await api.post('/auth/complete-onboarding');
    setUser(prev => ({ ...prev, onboarding_complete: true }));
  };

  const logout = () => {
    safeRemove('token');
    safeRemove('chat-prefill');
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
