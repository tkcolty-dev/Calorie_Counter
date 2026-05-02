import { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { searchOFF, mergeResults, searchFoodsCombined } from '../api/foodSearch';
import { isCachedSafe, verifyImageSafe } from '../api/imageSafety';

export default function FoodSearch({ onSelect, onQuickAdd }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const wrapperRef = useRef(null);
  const searchId = useRef(0);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchDone(false);
      return;
    }

    setSearching(true);
    setSearchDone(false);
    const currentSearch = ++searchId.current;

    const timer = setTimeout(async () => {
      try {
        // Use the shared combined search so local foods get OFF images
        // attached and we don't duplicate the merge/enrichment logic.
        const merged = await searchFoodsCombined(query, { localLimit: 8, brandedCap: 15 });
        if (searchId.current !== currentSearch) return;
        setResults(merged);
        setOpen(true);
      } catch {
        if (searchId.current === currentSearch) {
          setResults([]);
        }
      } finally {
        if (searchId.current === currentSearch) {
          setSearching(false);
          setSearchDone(true);
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  const handleSelect = (food) => {
    onSelect(food);
    setQuery('');
    setOpen(false);
    setResults([]);
    setSearchDone(false);
  };

  const handleFavorite = async (e, food) => {
    e.stopPropagation();
    try {
      if (food.isFavorite) {
        const prefs = await api.get('/preferences');
        const match = prefs.data.find(
          (p) => p.preference_type === 'favorite' && p.value.toLowerCase() === food.name.toLowerCase()
        );
        if (match) {
          await api.delete(`/preferences/${match.id}`);
        }
      } else {
        await api.post('/preferences', {
          preference_type: 'favorite',
          value: food.name,
        });
      }
      setResults((prev) =>
        prev.map((r) =>
          r.id === food.id ? { ...r, isFavorite: !r.isFavorite } : r
        )
      );
    } catch {}
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search foods…"
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          fontSize: '0.875rem',
          outline: 'none',
        }}
      />
      {searching && query.length >= 2 && (
        <div style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '0.75rem',
          color: 'var(--color-text-secondary)',
        }}>
          Searching...
        </div>
      )}
      {open && results.length > 0 && (
        <div className="food-search-dropdown">
          {results.map((food) => (
            <div
              key={food.id}
              className="food-search-item"
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <button
                onClick={() => handleSelect(food)}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.6rem',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  textAlign: 'left', font: 'inherit', color: 'inherit',
                }}
              >
                <FoodThumb food={food} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                    {food.name}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {food.brand && (
                      <span className="food-brand-badge">{food.brand}</span>
                    )}
                    <span>{food.serving_size}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '0.5rem' }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                    {food.calories_per_serving} cal
                  </div>
                  {(food.protein_g != null || food.carbs_g != null || food.fat_g != null) && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {food.protein_g != null ? `P:${food.protein_g}g` : ''}{food.carbs_g != null ? ` C:${food.carbs_g}g` : ''}{food.fat_g != null ? ` F:${food.fat_g}g` : ''}
                    </div>
                  )}
                </div>
              </button>
              <button
                onClick={(e) => handleFavorite(e, food)}
                title={food.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                className={`food-fav-btn${food.isFavorite ? ' active' : ''}`}
              >
                {food.isFavorite ? '★' : '☆'}
              </button>
              {onQuickAdd && (
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickAdd(food); }}
                  title="Add to meal"
                  className="food-quickadd-btn"
                  aria-label={`Add ${food.name} to meal`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!searching && searchDone && results.length === 0 && query.length >= 2 && (
        <div style={{
          padding: '0.75rem',
          fontSize: '0.85rem',
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
        }}>
          No results found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

export function FoodThumb({ food, size = 36 }) {
  const url = food?.image_url || null;
  // Gate image display behind an AI safety check. Show letter-avatar by
  // default; swap to image only after the URL is verified safe.
  const [verdict, setVerdict] = useState(() => {
    if (!url) return 'none';
    return isCachedSafe(url) ? 'safe' : 'pending';
  });
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
    if (!url) { setVerdict('none'); return; }
    if (isCachedSafe(url)) { setVerdict('safe'); return; }
    setVerdict('pending');
    let cancelled = false;
    verifyImageSafe(url).then(safe => {
      if (cancelled) return;
      setVerdict(safe ? 'safe' : 'unsafe');
    });
    return () => { cancelled = true; };
  }, [url]);

  if (verdict === 'safe' && url && !errored) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setErrored(true)}
        style={{
          width: size, height: size, borderRadius: 8, objectFit: 'cover',
          flexShrink: 0, background: 'var(--color-border)',
        }}
      />
    );
  }
  // Letter-avatar fallback (also used while pending and for unsafe content)
  const letter = (food?.name || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: 8, flexShrink: 0,
        background: 'color-mix(in srgb, var(--color-primary) 12%, var(--color-bg))',
        color: 'var(--color-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: size * 0.42,
      }}
    >
      {letter}
    </div>
  );
}
