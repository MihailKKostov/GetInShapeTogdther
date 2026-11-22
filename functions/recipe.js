// Extract a recipe from a web page's schema.org JSON-LD (the format most recipe sites and
// recipe plugins publish for Google). Pure functions, no network access, so they're easy to test.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°' };

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First number in a value like "350 kcal", "12,5 g" or 20. */
export function firstNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const m = v.replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

function hasType(node, type) {
  const t = node?.['@type'];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

/** Depth-first search through JSON-LD (arrays, @graph, nested objects) for a Recipe node. */
export function findRecipeNode(data, depth = 0) {
  if (!data || typeof data !== 'object' || depth > 8) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const r = findRecipeNode(item, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (hasType(data, 'Recipe')) return data;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipeNode(data[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function parseYield(y) {
  const values = (Array.isArray(y) ? y : [y]).filter((v) => v != null);
  for (const v of values) {
    const n = firstNumber(v);
    if (n && n > 0 && n <= 100) return { servings: Math.round(n), label: typeof v === 'string' ? decodeEntities(v) : `${n}` };
  }
  return { servings: undefined, label: values.length ? decodeEntities(values[0]) : undefined };
}

function parseImage(img) {
  if (!img) return undefined;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return parseImage(img[0]);
  if (typeof img === 'object') return img.url || img.contentUrl || undefined;
  return undefined;
}

/** schema.org NutritionInformation → per-serving nutrients (kcal, g, mg). */
export function parseNutrition(n) {
  if (!n || typeof n !== 'object') return null;
  let kcal = firstNumber(n.calories);
  const calText = String(n.calories ?? '').toLowerCase();
  if (kcal != null && calText.includes('kj') && !calText.includes('cal')) kcal = kcal / 4.184;
  const grams = (v) => {
    const x = firstNumber(v);
    if (x == null) return undefined;
    return /mg/i.test(String(v)) ? x / 1000 : x;
  };
  let sodiumMg;
  if (n.sodiumContent != null) {
    const x = firstNumber(n.sodiumContent);
    if (x != null) sodiumMg = /mg/i.test(String(n.sodiumContent)) ? x : /\bg\b|\dg/i.test(String(n.sodiumContent)) ? x * 1000 : x;
  }
  const out = {
    kcal: kcal != null ? Math.round(kcal) : undefined,
    protein: grams(n.proteinContent),
    carbs: grams(n.carbohydrateContent),
    fat: grams(n.fatContent),
    fiber: grams(n.fiberContent),
    sugar: grams(n.sugarContent),
    satFat: grams(n.saturatedFatContent),
    sodiumMg: sodiumMg != null ? Math.round(sodiumMg) : undefined,
  };
  for (const k of Object.keys(out)) if (out[k] == null || !Number.isFinite(out[k])) delete out[k];
  for (const k of ['protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat']) if (out[k] != null) out[k] = Math.round(out[k] * 10) / 10;
  return Object.keys(out).length ? { ...out, servingSize: n.servingSize ? decodeEntities(n.servingSize) : undefined } : null;
}

const META_TITLE = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i;

/** Returns { name, servings, yieldLabel, image, nutrition, ingredients, url } or null if no recipe found. */
export function extractRecipe(html, url) {
  const blocks = [...String(html).matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let node = null;
  for (const [, raw] of blocks) {
    try {
      // Some sites leave HTML comments or trailing junk around the JSON.
      const text = raw.trim().replace(/^<!--/, '').replace(/-->$/, '').trim();
      node = findRecipeNode(JSON.parse(text));
    } catch {
      node = null;
    }
    if (node) break;
  }
  if (!node) return null;
  const { servings, label } = parseYield(node.recipeYield ?? node.yield);
  const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : Array.isArray(node.ingredients) ? node.ingredients : [])
    .map((s) => decodeEntities(s))
    .filter(Boolean)
    .slice(0, 80);
  const title = node.name ? decodeEntities(node.name) : (String(html).match(META_TITLE)?.[1] ? decodeEntities(String(html).match(META_TITLE)[1]) : 'Imported recipe');
  return {
    name: title.slice(0, 120),
    servings: servings ?? null,
    yieldLabel: label ?? null,
    image: parseImage(node.image) ?? null,
    nutrition: parseNutrition(node.nutrition),
    ingredients,
    url,
  };
}
