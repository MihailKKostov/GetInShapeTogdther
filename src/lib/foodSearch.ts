import type { Food, Nutrients } from '../data/types';

// Open Food Facts — free, open database of packaged foods. No API key needed.
const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity';

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function toFood(p: OffProduct): Food | null {
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy_100g']);
    if (kj != null) kcal = kj / 4.184;
  }
  if (kcal == null || !p.product_name) return null;
  const sodium = num(n['sodium_100g']);
  const salt = num(n['salt_100g']);
  const per100: Nutrients = {
    kcal: Math.round(kcal),
    protein: num(n['proteins_100g']) ?? 0,
    carbs: num(n['carbohydrates_100g']) ?? 0,
    fat: num(n['fat_100g']) ?? 0,
    fiber: num(n['fiber_100g']),
    sugar: num(n['sugars_100g']),
    satFat: num(n['saturated-fat_100g']),
    sodiumMg: sodium != null ? Math.round(sodium * 1000) : salt != null ? Math.round((salt / 2.5) * 1000) : undefined,
  };
  const sq = num(p.serving_quantity);
  return {
    id: `off:${p.code ?? p.product_name}`,
    source: 'off',
    name: p.product_name.trim(),
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    per100,
    servingG: sq && sq > 0 ? sq : undefined,
    servingLabel: p.serving_size || undefined,
  };
}

export async function searchOpenFoodFacts(q: string, signal?: AbortSignal): Promise<Food[]> {
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Food database returned ${res.status}`);
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(toFood).filter((f): f is Food => f !== null);
}

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<Food | null> {
  const res = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (data.status !== 1 || !data.product) return null;
  return toFood({ ...data.product, code });
}
