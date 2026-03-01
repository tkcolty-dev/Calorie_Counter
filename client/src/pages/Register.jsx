import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      await register(username, password, captchaAnswer, captcha?.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
      loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            Bitewise
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              At least 6 characters
            </span>
          </div>

          {captcha && (
            <div className="form-group">
              <label htmlFor="captcha" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{captcha.question}</span>
                <button
                  type="button"
                  onClick={loadCaptcha}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--color-primary)', fontSize: '0.8rem', padding: 0,
                  }}
                >
                  New question
                </button>
              </label>
              <input
                id="captcha"
                type="number"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="Your answer"
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '0.625rem', marginTop: '0.5rem' }}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
