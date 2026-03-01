import { useState, useEffect, useRef } from 'react';

export default function MessageToast({ message, onTap }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(null);
  const lastShownId = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!message || message.id === lastShownId.current) return;
    lastShownId.current = message.id;
    setCurrent(message);
    setVisible(true);

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 4000);

    return () => clearTimeout(timerRef.current);
  }, [message]);

  const handleClick = () => {
    setVisible(false);
    clearTimeout(timerRef.current);
    if (onTap) onTap();
  };

  if (!current) return null;

  const preview = current.text?.length > 60
    ? current.text.slice(0, 60) + '...'
    : current.text;

  return (
    <div
      className={`msg-toast ${visible ? 'visible' : ''}`}
      onClick={handleClick}
    >
      <div className="msg-toast-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div className="msg-toast-body">
        <div className="msg-toast-sender">{current.sender_username}</div>
        <div className="msg-toast-text">{preview}</div>
      </div>
    </div>
  );
}
