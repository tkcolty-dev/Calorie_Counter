import api from './client';

const OFF_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';

export function titleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (c) => c.toUpperCase());
}

// OFF sometimes returns image URLs in a malformed shape like
// `.../front_fr.202.1` — the trailing `.1` does not correspond to a valid
// size suffix and the URL 404s. Normalize: keep `<imgname>.<rev>` (where rev
// is at least 2 digits, treated as a revision number), drop any further
// trailing `.<short_digits>`, and ensure a `.200.jpg` size suffix.
function normalizeOffImageUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(raw)) return raw;

  const m = raw.match(/^([^?#]*)([?#].*)?$/);
  let base = (m && m[1]) || raw;
  const tail = (m && m[2]) || '';

  // Drop a trailing low-digit fragment (e.g. `.1`, `.2`) that isn't a size key.
  // Real OFF size suffixes are 100, 200, 400, or `full`.
  base = base.replace(/\.([0-9]{1,2})$/, '');

  // If the URL still doesn't end in a known size key, append `.200`
  if (!/\.(100|200|400|full)$/.test(base)) {
    base = `${base}.200`;
  }
  return `${base}.jpg${tail}`;
}

export async function searchOFF(query) {
  try {
    const params = new URLSearchParams({
      search_terms: query,
      json: '1',
      page_size: '50',
      search_simple: '1',
      action: 'process',
      fields: 'product_name,brands,nutriments,serving_size,code,image_url,image_front_url,image_thumb_url,image_small_url,image_front_thumb_url,image_front_small_url',
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
        // Try preferred fields in order, normalize each. The first one that
        // produces a valid-looking URL wins.
        const candidates = [
          p.image_front_small_url,
          p.image_small_url,
          p.image_front_thumb_url,
          p.image_thumb_url,
          p.image_front_url,
          p.image_url,
        ];
        let image = null;
        for (const c of candidates) {
          const norm = normalizeOffImageUrl(c);
          if (norm) { image = norm; break; }
        }
        return {
          id: `off-${p.code}`,
          name: titleCase(p.product_name),
          brand: p.brands || null,
          calories_per_serving: calories,
          serving_size: servingLabel,
          image_url: image,
          source: 'off',
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function mergeResults(localRes, offResults, brandedCap = 15) {
  const seen = new Set();
  const merged = [...localRes];
  let brandedCount = 0;
  for (const item of offResults) {
    if (item.brand && brandedCount < brandedCap) {
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

// Borrow an image from OFF products whose name overlaps with the local food
// name. The local food DB ships without images (just names + calories), but
// OFF products always carry an image. For "BBQ Chicken Pizza" (local), this
// attaches the image of any OFF product whose name contains those same
// tokens — close enough to look like a real photo of that dish.
function tokenize(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[()\-/,]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3)
  );
}

function attachImagesToLocal(localList, offList) {
  if (!Array.isArray(localList) || !Array.isArray(offList) || offList.length === 0) {
    return localList || [];
  }
  return localList.map(l => {
    if (l.image_url) return l;
    const lt = tokenize(l.name);
    if (lt.size === 0) return l;
    let best = null;
    let bestOverlap = 0;
    for (const o of offList) {
      if (!o.image_url) continue;
      const ot = tokenize(o.name);
      let overlap = 0;
      for (const t of ot) if (lt.has(t)) overlap++;
      if (overlap > bestOverlap) { best = o; bestOverlap = overlap; }
    }
    // One overlapping food-noun is enough — even a generic "pizza" photo
    // beats a letter avatar. Tokens are already filtered to length >= 3.
    if (best && bestOverlap >= 1) {
      return { ...l, image_url: best.image_url };
    }
    return l;
  });
}

// One-shot combined search — local DB + OFF in parallel, with images.
export async function searchFoodsCombined(query, { localLimit = 6, brandedCap = 6 } = {}) {
  if (!query || query.length < 2) return [];
  const [localRes, offRes] = await Promise.all([
    api.get('/foods', { params: { q: query } }).then(r => r.data).catch(() => []),
    searchOFF(query).catch(() => []),
  ]);
  const local = (localRes || []).slice(0, localLimit);
  const enriched = attachImagesToLocal(local, offRes || []);
  return mergeResults(enriched, offRes || [], brandedCap);
}
