import { useState, useEffect, useRef } from 'react';
import api from '../api/client';

const OFF_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';

function titleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (c) => c.toUpperCase());
}

async function searchOFF(query) {
  try {
    const params = new URLSearchParams({
      search_terms: query,
      json: '1',
      page_size: '50',
      search_simple: '1',
      action: 'process',
      fields: 'product_name,brands,nutriments,serving_size,code',
    });
    const resp = await fetch(`${OFF_BASE}?${params}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!data.products) return [];
    return data.products
      .map((p) => {
        if (!p.product_name) return null;
        const calServing = p.nutriments?.['energy-kcal_serving'];
        const cal100g = p.nutriments?.['energy-kcal_100g'];
        const calories = calServing ? Math.round(calServing) : cal100g ? Math.round(cal100g) : null;
        if (!calories || calories <= 0 || calories > 3000) return null;
        const servingLabel = calServing && p.serving_size
          ? p.serving_size
          : cal100g ? 'per 100g' : '1 serving';
        return {
          id: `off-${p.code}`,
          name: titleCase(p.product_name),
          brand: p.brands || null,
          calories_per_serving: calories,
          serving_size: servingLabel,
          source: 'off',
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function mergeResults(localRes, offResults) {
  const seen = new Set();
  const merged = [...localRes];
  let brandedCount = 0;
  for (const item of offResults) {
    if (item.brand && brandedCount < 15) {
      const key = `${item.name.toLowerCase()}|${item.brand.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
        brandedCount++;
      }
    }
  }
  return merged;
}

export default function FoodSearch({ onSelect }) {
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
        // Run local DB and Open Food Facts searches in parallel
        const localPromise = api.get('/foods', { params: { q: query } }).then((r) => r.data);
        const offPromise = searchOFF(query);

        // Show local results as soon as they arrive
        const localRes = await localPromise;
        if (searchId.current !== currentSearch) return;

        if (localRes.length > 0) {
          setResults(localRes);
          setOpen(true);
        }

        // Merge in branded results when they arrive
        const offResults = await offPromise;
        if (searchId.current !== currentSearch) return;

        const merged = mergeResults(localRes, offResults);
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
        placeholder="Search foods (e.g. DiGiorno pizza, thin crust, Big Mac)..."
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
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  textAlign: 'left', font: 'inherit', color: 'inherit',
                }}
              >
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
                {food.isFavorite ? '\u2605' : '\u2606'}
              </button>
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
