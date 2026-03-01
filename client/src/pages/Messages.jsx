import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { markMessagesRead } from '../hooks/useNewMessages';
import BackHeader from '../components/BackHeader';

export default function Messages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeUser, setActiveUser] = useState(null);
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  const { data: sharingData, isLoading } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => api.get('/sharing').then(r => r.data),
    staleTime: 1000 * 60 * 2,
  });

  // Build deduplicated list of shared users with a share_id for comments
  const sharedUsers = [];
  const seen = new Set();
  if (sharingData) {
    for (const s of (sharingData.sharedWithMe || [])) {
      if (s.status === 'accepted' && !seen.has(s.owner_id)) {
        seen.add(s.owner_id);
        sharedUsers.push({ userId: s.owner_id, username: s.owner_username, shareId: s.id });
      }
    }
    for (const s of (sharingData.sharing || [])) {
      if (s.status === 'accepted' && !seen.has(s.viewer_id)) {
        seen.add(s.viewer_id);
        sharedUsers.push({ userId: s.viewer_id, username: s.viewer_username, shareId: s.id });
      }
    }
  }

  const activeShareId = activeUser?.shareId || null;

  const { data: commentsData } = useQuery({
    queryKey: ['share-comments', activeShareId],
    queryFn: () => api.get(`/sharing/${activeShareId}/comments`).then(r => r.data),
    enabled: !!activeShareId,
    refetchInterval: 2000,
    staleTime: 1000,
  });

  // Mark messages as read when opening this page
  useEffect(() => {
    markMessagesRead();
    queryClient.invalidateQueries({ queryKey: ['new-messages'] });
  }, [queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [commentsData?.comments?.length]);

  const sendMessage = useMutation({
    mutationFn: (msg) => api.post(`/sharing/${activeShareId}/comments`, { text: msg }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-comments', activeShareId] });
      setText('');
    },
  });

  const handleSend = (e) => {
    if (e) e.preventDefault();
    if (!text.trim()) return;
    sendMessage.mutate(text.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) return <div className="loading">Loading...</div>;

  // Chat thread view
  if (activeUser) {
    const comments = commentsData?.comments || [];
    return (
      <div className="messages-thread">
        {/* Header */}
        <div className="messages-header">
          <button onClick={() => setActiveUser(null)} className="messages-header-back">&larr;</button>
          <div className="messages-avatar">{activeUser.username[0].toUpperCase()}</div>
          <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{activeUser.username}</span>
        </div>

        {/* Messages */}
        <div className="share-chat-messages" style={{ flex: 1 }}>
          {comments.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', margin: 'auto', textAlign: 'center' }}>
              No messages yet. Say hi!
            </p>
          ) : (
            comments.map((c, i) => {
              const isMine = c.sender_username === user?.username;
              const prev = comments[i - 1];
              const sameSender = prev && prev.sender_username === c.sender_username;
              return (
                <div
                  key={c.id}
                  className={`share-chat-msg ${isMine ? 'mine' : 'theirs'}`}
                  style={sameSender ? { marginTop: '-0.1rem' } : { marginTop: '0.35rem' }}
                >
                  {!sameSender && !isMine && <div className="chat-sender">{c.sender_username}</div>}
                  <div>{c.text}</div>
                  <div className="chat-time">
                    {new Date(c.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="share-chat-input" style={{ flexShrink: 0, padding: '0.5rem 0' }}>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
          />
          <button type="submit" className="btn btn-primary" disabled={sendMessage.isPending || !text.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>
          </button>
        </form>
      </div>
    );
  }

  // User list view
  return (
    <div>
      <BackHeader title="Messages" subtitle="Chat with people you share with" />

      {sharedUsers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '2rem 1rem' }}>
          <p>No shared users yet.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Go to Sharing to connect with someone first.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sharedUsers.map(u => (
            <button
              key={u.userId}
              onClick={() => setActiveUser(u)}
              className="card profile-link"
              style={{ cursor: 'pointer', border: 'none', textAlign: 'left', fontFamily: 'inherit', fontSize: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="messages-avatar large">{u.username[0].toUpperCase()}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{u.username}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Tap to chat</div>
                </div>
              </div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '1.2rem' }}>&rsaquo;</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
