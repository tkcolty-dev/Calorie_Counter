import api from './client';

const OFF_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';

export function titleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-/])\w/g, (c) => c.toUpperCase());
}

export async function searchOFF(query) {
  try {
    const params = new URLSearchParams({
      search_terms: query,
      json: '1',
      page_size: '50',
      search_simple: '1',
      action: 'process',
      fields: 'product_name,brands,nutriments,serving_size,code,image_thumb_url,image_small_url,image_front_thumb_url,image_front_small_url',
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
        const image = p.image_front_thumb_url || p.image_thumb_url || p.image_front_small_url || p.image_small_url || null;
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

// One-shot combined search — local DB + OFF in parallel, with images.
export async function searchFoodsCombined(query, { localLimit = 6, brandedCap = 6 } = {}) {
  if (!query || query.length < 2) return [];
  const [localRes, offRes] = await Promise.all([
    api.get('/foods', { params: { q: query } }).then(r => r.data).catch(() => []),
    searchOFF(query).catch(() => []),
  ]);
  const local = (localRes || []).slice(0, localLimit);
  return mergeResults(local, offRes || [], brandedCap);
}
