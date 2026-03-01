import { useState, useRef } from 'react';
import api from '../api/client';

function resizeImage(file, maxSize = 1024) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          } else {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function PhotoCapture({ onResults, onClose }) {
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const dataUrl = await resizeImage(file);
    setPreview(dataUrl);
    setAnalyzing(true);
    try {
      const res = await api.post('/photo/analyze', { image: dataUrl });
      setResults(res.data.items);
    } catch {
      setError('Failed to analyze photo. Try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Photo Log</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>&times;</button>
        </div>

        {!preview ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <button className="btn btn-primary" onClick={() => inputRef.current?.click()} style={{ padding: '0.75rem 2rem', fontSize: '0.9rem' }}>
              Take Photo or Choose Image
            </button>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
          </div>
        ) : (
          <>
            <img src={preview} alt="Food" style={{ width: '100%', borderRadius: 'var(--radius)', marginBottom: '0.75rem' }} />
            {analyzing && <div className="loading" style={{ textAlign: 'center' }}>Analyzing photo...</div>}
            {error && <div className="error-message">{error}</div>}
            {results && (
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>Detected Items</h3>
                {results.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        {item.protein_g != null ? `P:${item.protein_g}g ` : ''}{item.carbs_g != null ? `C:${item.carbs_g}g ` : ''}{item.fat_g != null ? `F:${item.fat_g}g` : ''}
                      </div>
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.calories} cal</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onResults(results); onClose(); }}>
                    Log All ({results.reduce((s, r) => s + r.calories, 0)} cal)
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setPreview(null); setResults(null); }}>
                    Retake
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
