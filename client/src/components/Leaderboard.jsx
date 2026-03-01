import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

const BLUE = '#2563eb';

const MedalIcon = ({ place }) => {
  const size = 20;
  if (place === 1) {
    // Gold-style: trophy with "1"
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
        <path d="M4 22h16"/>
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
      </svg>
    );
  }
  if (place === 2) {
    // Silver-style: medal with "2"
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
        <path d="M4 22h16"/>
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
      </svg>
    );
  }
  if (place === 3) {
    // Bronze-style: medal with "3"
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
        <path d="M4 22h16"/>
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
      </svg>
    );
  }
  return null;
};

export default function Leaderboard() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['leaderboard', today],
    queryFn: () => api.get('/reports/leaderboard', { params: { today } }).then(r => r.data),
  });

  if (isLoading || leaderboard.length === 0) return null;

  return (
    <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Leaderboard</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {leaderboard.map((entry, i) => (
          <div key={entry.username} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}>
            <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 600, color: BLUE }}>
              {i < 3 ? <MedalIcon place={i + 1} /> : `${i + 1}.`}
            </span>
            <span style={{ flex: 1, fontWeight: 500, fontSize: '0.85rem' }}>{entry.username}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              {entry.currentStreak > 0 ? `${entry.currentStreak}d streak` : ''} &middot; {entry.daysLast30}/30
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
