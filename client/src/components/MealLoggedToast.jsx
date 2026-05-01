import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

const VISIBLE_MS = 4500;

export default function MealLoggedToast() {
  const [toast, setToast] = useState(null); // { name, calories, ids, undone }
  const hideTimer = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const onLogged = (e) => {
      const { name, calories, ids = [] } = e.detail || {};
      if (!name) return;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ name, calories, ids, undone: false });
      hideTimer.current = setTimeout(() => setToast(null), VISIBLE_MS);
    };
    window.addEventListener('meal-logged-toast', onLogged);
    return () => {
      window.removeEventListener('meal-logged-toast', onLogged);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!toast) return null;

  const handleUndo = async () => {
    const ids = toast.ids || [];
    setToast(t => t ? { ...t, undone: true } : t);
    try {
      await Promise.all(ids.map(id => api.delete(`/meals/${id}`).catch(() => null)));
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: ['top-foods-quick'] });
      queryClient.invalidateQueries({ queryKey: ['top-foods-dash'] });
    } catch {}
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setToast(null), 1200);
  };

  return (
    <div
      className={`meal-toast${toast.undone ? ' undone' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="meal-toast-icon">
        {toast.undone ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </div>
      <div className="meal-toast-body">
        <div className="meal-toast-title">
          {toast.undone ? 'Removed' : 'Logged'}
        </div>
        <div className="meal-toast-detail">
          {toast.name}
          {!toast.undone && toast.calories ? ` · ${toast.calories} cal` : ''}
        </div>
      </div>
      {!toast.undone && toast.ids?.length > 0 && (
        <button className="meal-toast-undo" onClick={handleUndo} aria-label="Undo last log">
          Undo
        </button>
      )}
    </div>
  );
}
