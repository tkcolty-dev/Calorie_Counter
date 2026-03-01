const pool = require('../config/db');

const OFF_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';

function titleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-/])\w/g, (c) => c.toUpperCase());
}

async function searchOpenFoodFacts(query) {
  try {
    const params = new URLSearchParams({
      search_terms: query,
      json: '1',
      page_size: '15',
      search_simple: '1',
      action: 'process',
      fields: 'product_name,brands,nutriments,serving_size,code',
    });
    const resp = await fetch(`${OFF_BASE}?${params}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Bitewise/1.0' },
    });
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
        const protein = p.nutriments?.proteins_serving != null
          ? Math.round(p.nutriments.proteins_serving * 10) / 10
          : p.nutriments?.proteins_100g != null ? Math.round(p.nutriments.proteins_100g * 10) / 10 : null;
        const carbs = p.nutriments?.carbohydrates_serving != null
          ? Math.round(p.nutriments.carbohydrates_serving * 10) / 10
          : p.nutriments?.carbohydrates_100g != null ? Math.round(p.nutriments.carbohydrates_100g * 10) / 10 : null;
        const fat = p.nutriments?.fat_serving != null
          ? Math.round(p.nutriments.fat_serving * 10) / 10
          : p.nutriments?.fat_100g != null ? Math.round(p.nutriments.fat_100g * 10) / 10 : null;
        return {
          id: `off-${p.code}`,
          name: titleCase(p.product_name),
          brand: p.brands || null,
          category: 'food',
          calories_per_serving: calories,
          serving_size: servingLabel,
          source: 'off',
          protein_g: protein,
          carbs_g: carbs,
          fat_g: fat,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function searchLocalDB(query) {
  const result = await pool.query(
    `SELECT DISTINCT ON (LOWER(name)) id, name, category, calories_per_serving, serving_size, protein_g, carbs_g, fat_g
     FROM food_database
     WHERE name ILIKE $1
     ORDER BY LOWER(name),
       CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,
       length(name)
     LIMIT 20`,
    [`%${query}%`, `${query}%`]
  );
  if (result.rows.length > 0) return result.rows;

  const fallback = await pool.query(
    `SELECT DISTINCT ON (LOWER(name)) id, name, category, calories_per_serving, serving_size, protein_g, carbs_g, fat_g
     FROM food_database
     WHERE search_vector @@ plainto_tsquery('english', $1)
     ORDER BY LOWER(name), ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
     LIMIT 20`,
    [query]
  );
  return fallback.rows;
}

async function searchFoods(query) {
  // Only search local DB from server — OFF is called from client
  const localRows = await searchLocalDB(query);
  return localRows.map((r) => ({ ...r, source: 'local' }));
}

module.exports = { searchFoods, searchLocalDB, searchOpenFoodFacts, titleCase };
