import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import Logo from '../components/Logo';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captcha, setCaptcha] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const loadCaptcha = useCallback(async () => {
    try {
      const res = await api.get('/auth/captcha');
      setCaptcha(res.data);
      setCaptchaAnswer('');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { loadCaptcha(); }, [loadCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(username.trim(), password, captchaAnswer, captcha?.token);
      navigate('/');
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        setError(err.response?.data?.error || 'Too many attempts. Try again later.');
      } else {
        setError(err.response?.data?.error || 'Registration failed');
      }
      loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = (() => {
    if (!password) return null;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length < 6) score = 0;
    const labels = ['Too short', 'Weak', 'Okay', 'Good', 'Strong', 'Strong'];
    const colors = ['var(--color-danger)', 'var(--color-danger)', 'var(--color-warning)', 'var(--color-primary)', 'var(--color-success)', 'var(--color-success)'];
    return { score, label: labels[score], color: colors[score] };
  })();

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand">
          <div className="auth-logo" aria-hidden="true">
            <Logo size={40} />
          </div>
          <h1 className="auth-title">Bitewise</h1>
          <p className="auth-sub">Create your account in under a minute.</p>
        </div>

        <form onSubmit={handleSubmit} className="card auth-card">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              inputMode="text"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="auth-pwd-wrap">
              <input
                id="password"
                name="password"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="new-password"
                required
                minLength={6}
              />
              <button
                type="button"
                className="auth-pwd-toggle"
                onClick={() => setShowPwd(s => !s)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
            {pwStrength ? (
              <div className="auth-pwd-meter">
                <div className="auth-pwd-meter-bar">
                  <div className="auth-pwd-meter-fill" style={{ width: `${(pwStrength.score / 5) * 100}%`, background: pwStrength.color }} />
                </div>
                <span className="auth-pwd-meter-label" style={{ color: pwStrength.color }}>{pwStrength.label}</span>
              </div>
            ) : (
              <span className="auth-pwd-hint">At least 6 characters — mix in numbers/symbols for stronger.</span>
            )}
          </div>

          {captcha && (
            <div className="form-group">
              <label htmlFor="captcha" className="auth-captcha-label">
                <span>Quick check: <strong>{captcha.question}</strong></span>
                <button
                  type="button"
                  onClick={loadCaptcha}
                  className="auth-captcha-refresh"
                >
                  ↻ New
                </button>
              </label>
              <input
                id="captcha"
                type="number"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="Your answer"
                inputMode="numeric"
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading || !username || password.length < 6 || !captchaAnswer}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-foot">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
