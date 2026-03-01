import { useState, useEffect } from 'react';

const TUTORIAL_KEY = 'tutorial-shown';

const steps = [
  {
    title: 'Welcome to Bitewise!',
    desc: 'Let\'s take a quick tour of the app so you know where everything is.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    ),
  },
  {
    title: 'Dashboard',
    desc: 'Your home screen shows today\'s calories, planned meals, and a weekly overview. Tap the week strip to browse different days.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
    ),
  },
  {
    title: 'Log Meals',
    desc: 'Search our food database or type your own. The AI will estimate calories for you. You can also use the AI Chat to log by just describing what you ate.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
    ),
  },
  {
    title: 'AI Chat',
    desc: 'Ask the AI anything — log meals by voice or text, plan tomorrow\'s food, get nutrition advice, or just chat about your diet.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    ),
  },
  {
    title: 'Share & Compete',
    desc: 'Connect with friends to share your progress, message each other, and compete in challenges. Find it all under Profile.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    ),
  },
  {
    title: 'You\'re all set!',
    desc: 'Start by logging your first meal. You can always access settings, goals, and sharing from your Profile tab.',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    ),
  },
];

export default function WelcomeTutorial() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TUTORIAL_KEY)) {
      // Small delay so dashboard renders first
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const finish = () => {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    setVisible(false);
  };

  return (
    <div className="tutorial-overlay" onClick={finish}>
      <div className="tutorial-card" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-icon" style={{ color: 'var(--color-primary)' }}>
          {current.icon}
        </div>
        <h2 className="tutorial-title">{current.title}</h2>
        <p className="tutorial-desc">{current.desc}</p>

        <div className="tutorial-dots">
          {steps.map((_, i) => (
            <span key={i} className={`tutorial-dot${i === step ? ' active' : ''}`} />
          ))}
        </div>

        <div className="tutorial-actions">
          {!isLast ? (
            <>
              <button className="btn btn-secondary" onClick={finish} style={{ padding: '0.5rem 1rem' }}>
                Skip
              </button>
              <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} style={{ padding: '0.5rem 1.5rem' }}>
                Next
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={finish} style={{ padding: '0.625rem 2rem', fontSize: '0.95rem' }}>
              Get Started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
