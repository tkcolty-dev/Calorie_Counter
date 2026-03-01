import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useNewShares } from '../hooks/useNewShares';
import api from '../api/client';

const ICON_COLOR = '#2563eb';

const links = [
  { to: '/goals', label: 'Calorie Goals', desc: 'Set daily calorie targets', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
  )},
  { to: '/preferences', label: 'Food Preferences', desc: 'Cuisines, dietary needs, favorites', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
  )},
  { to: '/sharing', label: 'Sharing', desc: 'Share your log with others', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  )},
  { to: '/messages', label: 'Messages', desc: 'Chat with shared friends', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  )},
  { to: '/weight', label: 'Weight Log', desc: 'Track your weight over time', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"/><path d="M3 12h18"/><path d="M16 7l-4-4-4 4"/><path d="M8 17l4 4 4-4"/></svg>
  )},
  { to: '/reports', label: 'Reports', desc: 'Charts, streaks, and insights', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
  )},
  { to: '/challenges', label: 'Challenges', desc: 'Compete with friends', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
  )},
];

function resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const { user, logout } = useAuth();
  const { newCount } = useNewShares();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: avatarData } = useQuery({
    queryKey: ['avatar', user?.id],
    queryFn: () => api.get(`/avatars/check/${user.id}`).then(r => r.data),
    enabled: !!user,
  });

  const uploadAvatar = useMutation({
    mutationFn: (image) => api.post('/avatars/upload', { image }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avatar'] });
      setUploadError('');
      setUploading(false);
    },
    onError: (err) => {
      setUploadError(err.response?.data?.error || 'Upload failed');
      setUploading(false);
    },
  });

  const removeAvatar = useMutation({
    mutationFn: () => api.delete('/avatars/mine'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avatar'] }),
  });

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image too large (max 5MB)');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const dataUrl = await resizeImage(file, 256);
      uploadAvatar.mutate(dataUrl);
    } catch {
      setUploadError('Failed to process image');
      setUploading(false);
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const changeTheme = (t) => {
    setTheme(t);
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
  };

  const avatarUrl = avatarData?.hasAvatar ? avatarData.avatarUrl : null;
  const initial = user?.username?.[0]?.toUpperCase() || '?';

  return (
    <div>
      {/* Profile header with avatar */}
      <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
        <div
          className="profile-avatar-wrapper"
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: 'pointer', display: 'inline-block', position: 'relative' }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Profile"
              className="profile-avatar"
            />
          ) : (
            <div className="profile-avatar profile-avatar-default">
              {initial}
            </div>
          )}
          <div className="profile-avatar-edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.25rem', marginBottom: 0 }}>{user?.username}</h1>
        {uploading && <p style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '0.25rem' }}>Uploading...</p>}
        {uploadError && <p style={{ fontSize: '0.8rem', color: 'var(--color-danger)', marginTop: '0.25rem' }}>{uploadError}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.5rem' }}>
          {avatarUrl && !uploading && (
            <button
              onClick={() => removeAvatar.mutate()}
              style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Remove photo
            </button>
          )}
          <button onClick={logout} style={{ fontSize: '0.75rem', color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </div>

      <div className="profile-links-list">
        {links.map(l => (
          <Link key={l.to} to={l.to} className="card profile-link">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="profile-link-icon" style={{
                background: `color-mix(in srgb, ${ICON_COLOR} 12%, transparent)`,
                color: ICON_COLOR,
              }}>
                {l.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {l.label}
                  {l.to === '/sharing' && newCount > 0 && (
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      background: 'var(--color-danger)',
                      color: '#fff',
                      padding: '1px 6px',
                      borderRadius: 10,
                    }}>
                      {newCount} new
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{l.desc}</div>
              </div>
            </div>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '1.2rem' }}>&rsaquo;</span>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Appearance</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Choose your theme</div>
          </div>
          <div className="theme-toggle">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => changeTheme('light')}>Light</button>
            <button className={theme === 'auto' ? 'active' : ''} onClick={() => changeTheme('auto')}>Auto</button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => changeTheme('dark')}>Dark</button>
          </div>
        </div>
      </div>

    </div>
  );
}
