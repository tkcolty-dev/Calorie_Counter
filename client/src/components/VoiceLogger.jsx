import { useState, useEffect, useRef } from 'react';
import api from '../api/client';

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export default function VoiceLogger({ onSelect, onClose }) {
  const [phase, setPhase] = useState(SpeechRecognition ? 'idle' : 'unsupported');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [meals, setMeals] = useState(null);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const startListening = () => {
    setError('');
    setTranscript('');
    setInterim('');
    setMeals(null);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let final = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interimText += event.results[i][0].transcript;
        }
      }
      setTranscript(final);
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        setError('No speech detected. Tap the mic and try again.');
        setPhase('idle');
      } else if (event.error !== 'aborted') {
        setError(`Mic error: ${event.error}. Please try again.`);
        setPhase('idle');
      }
    };

    recognition.onend = () => {
      // Only auto-submit if we were still listening (not manually stopped)
      if (phase === 'listening') {
        setPhase(prev => prev === 'listening' ? 'idle' : prev);
      }
    };

    recognition.start();
    setPhase('listening');
  };

  const stopAndParse = async () => {
    recognitionRef.current?.stop();
    const finalText = transcript + interim;
    setTranscript(finalText);
    setInterim('');

    if (!finalText.trim()) {
      setError('No speech detected. Tap the mic and try again.');
      setPhase('idle');
      return;
    }

    setPhase('parsing');
    try {
      const res = await api.post('/voice-log', { transcript: finalText });
      if (!res.data.meals || res.data.meals.length === 0) {
        setError('Could not identify any food items. Try again with clearer food names.');
        setPhase('idle');
        return;
      }
      setMeals(res.data.meals);
      setPhase('results');
    } catch {
      setError('Failed to analyze. Check your connection and try again.');
      setPhase('idle');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Voice Log</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>&times;</button>
        </div>

        {phase === 'unsupported' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Voice input is not supported in this browser. Try Chrome or Safari.
            </p>
          </div>
        )}

        {(phase === 'idle' || phase === 'listening') && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <button
              className={`voice-logger-mic${phase === 'listening' ? ' listening' : ''}`}
              onClick={phase === 'listening' ? stopAndParse : startListening}
            >
              {phase === 'listening' ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              {phase === 'listening' ? 'Listening... tap to finish' : 'Tap to start speaking'}
            </p>

            {(transcript || interim) && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius)', textAlign: 'left' }}>
                <span className="voice-transcript">{transcript}</span>
                {interim && <span className="voice-transcript-interim">{interim}</span>}
              </div>
            )}

            {error && <div className="error-message" style={{ marginTop: '0.75rem' }}>{error}</div>}
          </div>
        )}

        {phase === 'parsing' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div className="loading">Analyzing your meal...</div>
            {transcript && (
              <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                "{transcript}"
              </p>
            )}
          </div>
        )}

        {phase === 'results' && meals && (
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Tap an item to fill the form</p>
            <div style={{ marginBottom: '0.75rem' }}>
              {meals.map((meal, i) => (
                <button
                  key={i}
                  className="voice-result-item"
                  onClick={() => { onSelect(meal); onClose(); }}
                  style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{meal.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      {meal.protein_g != null ? `P:${meal.protein_g}g ` : ''}{meal.carbs_g != null ? `C:${meal.carbs_g}g ` : ''}{meal.fat_g != null ? `F:${meal.fat_g}g` : ''}
                    </div>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{meal.calories} cal</span>
                </button>
              ))}
            </div>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { setMeals(null); setTranscript(''); setPhase('idle'); }}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
