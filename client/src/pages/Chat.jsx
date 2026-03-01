import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import ChatMessage from '../components/ChatMessage';

const quickActions = [
  'What should I eat right now?',
  'Plan my meals for tomorrow',
  'Log my usual breakfast',
  'Make a grocery list for my planned meals',
];

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Module-level: survives component unmount during navigation
let pendingRequest = null;
let pendingMessages = null; // cache for messages while navigating away

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(!!pendingRequest);
  const [streamingText, setStreamingText] = useState('');
  const [learnedNote, setLearnedNote] = useState('');
  const [listening, setListening] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const streamingRef = useRef('');
  const rafRef = useRef(null);
  const queryClient = useQueryClient();

  // Load chat history from server on mount
  useEffect(() => {
    if (pendingMessages) {
      setMessages(pendingMessages);
      setHistoryLoaded(true);
    } else {
      api.get('/chat-history').then(res => {
        setMessages(res.data);
        pendingMessages = res.data;
        setHistoryLoaded(true);
      }).catch(() => setHistoryLoaded(true));
    }
    if (pendingRequest) {
      setLoading(true);
      pendingRequest.then(() => {
        if (pendingMessages) {
          setMessages(pendingMessages);
        }
        setStreamingText('');
        setLoading(false);
        pendingRequest = null;
      });
    }
  }, []);

  const toggleListening = () => {
    if (!SpeechRecognition) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((r) => r[0].transcript).join('');
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  // Auto-send prefilled message from dashboard "What should I eat?"
  const prefillHandled = useRef(false);
  useEffect(() => {
    if (!historyLoaded || prefillHandled.current) return;
    const prefill = localStorage.getItem('chat-prefill');
    if (prefill) {
      prefillHandled.current = true;
      localStorage.removeItem('chat-prefill');
      sendMessage(prefill);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Scroll during streaming, but throttled
  const lastScrollRef = useRef(0);
  useEffect(() => {
    if (!streamingText) return;
    const now = Date.now();
    if (now - lastScrollRef.current > 300) {
      lastScrollRef.current = now;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamingText]);

  const clearChat = () => {
    setMessages([]);
    pendingMessages = [];
    api.delete('/chat-history').catch(() => {});
  };

  const sendMessage = useCallback(async (text) => {
    const userMsg = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    pendingMessages = updated;
    setInput('');
    setLoading(true);
    setStreamingText('');

    const token = localStorage.getItem('token');
    const n = new Date();
    const localToday = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;

    streamingRef.current = '';

    const doRequest = async () => {
      let accumulated = '';
      let metadata = null;

      // Abort if no data received within 60 seconds
      const controller = new AbortController();
      let lastActivity = Date.now();
      const timeout = setInterval(() => {
        if (Date.now() - lastActivity > 60000) {
          controller.abort();
          clearInterval(timeout);
        }
      }, 5000);

      // Throttle UI updates to once per animation frame
      let dirty = false;
      const scheduleUpdate = () => {
        if (!dirty) {
          dirty = true;
          rafRef.current = requestAnimationFrame(() => {
            setStreamingText(streamingRef.current);
            dirty = false;
          });
        }
      };

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: text,
            history: messages,
            today: localToday,
            hour: n.getHours(),
          }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error('Stream failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          lastActivity = Date.now();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            let jsonStr;
            if (line.startsWith('data:')) {
              jsonStr = line.slice(5).trim();
              if (!jsonStr) continue;
            } else continue;
            try {
              const data = JSON.parse(jsonStr);
              if (data.chunk) {
                accumulated += data.chunk;
                streamingRef.current = accumulated;
                scheduleUpdate();
              }
              if (data.done) {
                metadata = data;
              }
            } catch {}
          }
        }
      } catch {
        if (!accumulated) {
          accumulated = 'Sorry, something went wrong. Please try again.';
        }
      } finally {
        clearInterval(timeout);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      }

      // Use post-processed reply if available
      let finalContent = metadata?.reply || accumulated;

      // Append planned meal summary if AI saved plans
      if (metadata?.savedPlans?.length > 0) {
        const totalCal = metadata.savedPlans.reduce((s, m) => s + m.calories, 0);
        const date = metadata.savedPlans[0].planned_date?.split('T')[0];
        const label = date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
        const planItems = metadata.savedPlans.map(m => `${m.meal_type}: ${m.name} (${m.calories} cal)`).join('\n');
        finalContent += `\n\n---PLANNED:${label}:${totalCal}:${planItems}`;
      }

      // Save both messages to server
      const newMessages = [userMsg, { role: 'assistant', content: finalContent }];
      const allMessages = [...updated, { role: 'assistant', content: finalContent }];
      pendingMessages = allMessages;
      api.post('/chat-history', { messages: newMessages }).catch(() => {});

      return { content: finalContent, metadata };
    };

    const promise = doRequest();
    pendingRequest = promise;

    try {
      const result = await promise;
      setMessages(pendingMessages || []);
      setStreamingText('');

      if (result.metadata?.learnedPreferences?.length > 0) {
        const names = result.metadata.learnedPreferences.map(p => p.value).join(', ');
        setLearnedNote(`Remembered: ${names}`);
        queryClient.invalidateQueries({ queryKey: ['preferences'] });
        setTimeout(() => setLearnedNote(''), 4000);
      }
      if (result.metadata?.savedPlans?.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['planned-meals'] });
      }
    } finally {
      setLoading(false);
      pendingRequest = null;
    }
  }, [queryClient, messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && !loading && historyLoaded && (
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '2rem 0' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>AI Meal Assistant</h2>
            <p style={{ fontSize: '0.875rem' }}>Ask me about meal planning, nutrition advice, or recipe ideas.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {loading && streamingText && (
          <ChatMessage message={{ role: 'assistant', content: streamingText }} isStreaming />
        )}

        {loading && !streamingText && (
          <div className="chat-bubble assistant" style={{ color: 'var(--color-text-secondary)' }}>
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length === 0 && !loading && historyLoaded && (
        <div className="chat-quick-actions">
          {quickActions.map(action => (
            <button
              key={action}
              className="chat-quick-action"
              onClick={() => sendMessage(action)}
              disabled={loading}
            >
              {action}
            </button>
          ))}
        </div>
      )}

      {learnedNote && (
        <div style={{
          fontSize: '0.8rem',
          color: 'var(--color-success)',
          padding: '0.375rem 0',
          textAlign: 'center',
          fontWeight: 500,
        }}>
          {learnedNote}
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-input-bar">
        {SpeechRecognition && (
          <button
            type="button"
            className={`chat-mic-btn${listening ? ' active' : ''}`}
            onClick={toggleListening}
            disabled={loading}
            title={listening ? 'Stop listening' : 'Voice input'}
          >
            {listening ? (
              <svg width="36" height="36" viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="3" width="14" height="14" rx="2" /></svg>
            ) : (
              <svg width="36" height="36" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="1" width="6" height="11" rx="3" /><path d="M3.5 8.5a6.5 6.5 0 0 0 13 0" /><line x1="10" y1="15" x2="10" y2="19" /><line x1="7" y1="19" x2="13" y2="19" /></svg>
            )}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? 'Listening...' : 'Ask about meals, nutrition...'}
          disabled={loading}
        />
        <button type="submit" className="btn btn-primary" disabled={!input.trim() || loading}>
          Send
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.5rem' }}
            onClick={clearChat}
            title="Clear chat"
          >
            Clear
          </button>
        )}
      </form>
    </div>
  );
}
