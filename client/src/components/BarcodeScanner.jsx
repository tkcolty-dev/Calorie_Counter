import { useState, useRef, useEffect } from 'react';
import api from '../api/client';

export default function BarcodeScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        scanLoop(stream);
      } catch {
        setError('Camera access denied. You can manually enter the barcode below.');
      }
    }

    async function scanLoop(stream) {
      if (!('BarcodeDetector' in window)) {
        setError('Barcode detection not supported in this browser. Try Chrome on Android or enter the code manually.');
        return;
      }
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      setScanning(true);

      const tick = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            stream.getTracks().forEach(t => t.stop());
            await lookupBarcode(code);
            return;
          }
        } catch {}
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const [manualCode, setManualCode] = useState('');

  async function lookupBarcode(code) {
    setScanning(false);
    try {
      const res = await api.get(`/barcode/${code}`);
      onResult(res.data);
    } catch {
      setError(`No product found for barcode: ${code}`);
    }
  }

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) lookupBarcode(manualCode.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Scan Barcode</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>&times;</button>
        </div>

        <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', background: '#000', marginBottom: '0.75rem' }}>
          <video ref={videoRef} style={{ width: '100%', display: 'block' }} playsInline muted />
          {scanning && (
            <div style={{ position: 'absolute', top: '50%', left: '10%', right: '10%', height: 2, background: 'var(--color-danger)', opacity: 0.7 }} />
          )}
        </div>

        {error && <div className="error-message" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text" value={manualCode} onChange={(e) => setManualCode(e.target.value)}
            placeholder="Or enter barcode manually"
            style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>Look up</button>
        </form>
      </div>
    </div>
  );
}
