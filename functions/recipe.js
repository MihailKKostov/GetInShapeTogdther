// Extract a recipe from a web page. Ported from RecipeMan (parse/RecipeParser.kt).
// Strategy, in order of preference:
//  1. schema.org/Recipe JSON-LD (used by the vast majority of recipe sites)
//  2. schema.org/Recipe microdata
//  3. heuristics based on common class names ("ingredient", "instruction", ...)
// Later strategies only fill in fields the earlier ones left empty.
// Pure functions, no network access, so they're easy to test.
import { parse as parseHtml } from 'node-html-parser';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', ntilde: 'ñ', ccedil: 'ç', times: '×' };

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, ' ')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const clean = decodeEntities;

/** First number in a value like "350 kcal", "12,5 g" or 20. */
export function firstNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const m = v.replace(/(\d),(\d)/g, '$1.$2').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

// ───────────────────────── durations (RecipeMan: Durations.humanize)
const ISO = /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
export function humanizeDuration(value) {
  const v = String(value ?? '').trim();
  const m = ISO.exec(v);
  if (!m) return v;
  let total = Math.floor(Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
  if (total <= 0) return '';
  const parts = [];
  const d = Math.floor(total / 1440); total %= 1440;
  const h = Math.floor(total / 60); const min = total % 60;
  if (d > 0) parts.push(`${d} ${d === 1 ? 'day' : 'days'}`);
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hr' : 'hrs'}`);
  if (min > 0) parts.push(`${min} ${min === 1 ? 'min' : 'mins'}`);
  return parts.join(' ');
}

// ───────────────────────── JSON-LD helpers
function isRecipeType(o) {
  const t = o?.['@type'];
  if (typeof t === 'string') return /^(?:.*\/)?Recipe$/i.test(t);
  return Array.isArray(t) && t.some((x) => typeof x === 'string' && x.toLowerCase() === 'recipe');
}

function collectRecipes(node, out, depth = 0) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) { node.forEach((n) => collectRecipes(n, out, depth + 1)); return; }
  if (typeof node !== 'object') return;
  if (isRecipeType(node)) out.push(node);
  for (const [k, v] of Object.entries(node)) {
    if (k === 'recipeInstructions' || k === 'recipeIngredient') continue;
    if (v && typeof v === 'object') collectRecipes(v, out, depth + 1);
  }
}

/** Kept for compatibility with older callers: first Recipe node in parsed JSON-LD. */
export function findRecipeNode(data) {
  const out = [];
  collectRecipes(data, out);
  return out[0] ?? null;
}

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return clean(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length ? text(v[0]) : '';
  if (typeof v === 'object') return text(v.text ?? v.name ?? v['@value']);
  return clean(String(v));
}

function stringList(v) {
  if (v == null) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(stringList);
  if (typeof v === 'object') return [v.text ?? v.name].filter((x) => x != null).map(String);
  return [String(v)];
}

function htmlToLines(html) {
  const root = parseHtml(`<div>${html}</div>`);
  const blocks = root.querySelectorAll('li, p');
  return blocks.length ? blocks.map((b) => b.text) : root.text.split('\n');
}

function instructions(v) {
  const out = [];
  const walk = (node, depth) => {
    if (node == null || depth > 6) return;
    if (typeof node === 'string') {
      const plain = node.includes('<') ? htmlToLines(node) : node.split(/\r?\n/);
      plain.map(clean).filter(Boolean).forEach((l) => out.push(l));
    } else if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
    } else if (typeof node === 'object') {
      const type = String(node['@type'] ?? '');
      const items = node.itemListElement;
      if (/HowToSection/i.test(type) || (items != null && !('text' in node))) {
        const name = text(node.name);
        if (name) out.push(name.endsWith(':') ? name : `${name}:`);
        walk(items, depth + 1);
      } else {
        const t = text(node.text) || text(node.name) || text(node.description);
        if (t) out.push(t);
      }
    } else out.push(clean(String(node)));
  };
  walk(v, 0);
  // Drop "Step 1" style prefixes that some sites bake into the text.
  return out.map((s) => s.replace(/^(step\s*\d+[:.)]?\s*)/i, '').trim()).filter(Boolean);
}

function yieldOf(v) {
  const all = stringList(v).map(clean).filter(Boolean);
  if (!all.length) return '';
  return all.find((s) => /\p{L}/u.test(s)) ?? all[0];
}

function imageOf(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) {
    const best = v.filter((x) => x && typeof x === 'object').sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0];
    if (best && Number(best.width) > 0) return imageOf(best);
    for (const x of v) { const s = imageOf(x); if (s) return s; }
    return '';
  }
  if (typeof v === 'object') return imageOf(v.url ?? v.contentUrl ?? v['@id']);
  return '';
}

const NUTRITION_LABELS = [
  ['servingSize', 'Serving size'], ['calories', 'Calories'], ['fatContent', 'Fat'], ['saturatedFatContent', 'Saturated fat'],
  ['unsaturatedFatContent', 'Unsaturated fat'], ['transFatContent', 'Trans fat'], ['cholesterolContent', 'Cholesterol'],
  ['sodiumContent', 'Sodium'], ['carbohydrateContent', 'Carbohydrates'], ['fiberContent', 'Fiber'], ['sugarContent', 'Sugar'],
  ['proteinContent', 'Protein'],
];

function nutritionText(v) {
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== 'object') return '';
  return NUTRITION_LABELS.map(([key, label]) => {
    const value = text(o[key]).replace(/(\d+\.\d)\d{2,}/g, '$1').replace(/\.0\b/, '');
    return value ? `${label}: ${value}` : null;
  }).filter(Boolean).join('\n');
}

/** schema.org NutritionInformation → per-serving nutrients (kcal, g, mg). */
export function parseNutrition(n) {
  if (Array.isArray(n)) n = n[0];
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
  return Object.keys(out).length ? { ...out, servingSize: n.servingSize ? clean(text(n.servingSize)) : undefined } : null;
}

function publisherName(o) {
  const p = Array.isArray(o.publisher) ? o.publisher[0] : o.publisher;
  return p && typeof p === 'object' ? text(p.name) : '';
}

function scoreJson(o) {
  return ((o.recipeIngredient ?? o.ingredients) != null ? 2 : 0) + (o.recipeInstructions != null ? 2 : 0) + (o.name ? 1 : 0);
}

function fromJsonRecipe(o) {
  return {
    name: text(o.name),
    description: text(o.description),
    ingredients: stringList(o.recipeIngredient ?? o.ingredients).flatMap((s) => s.split('\n')).map(clean).filter(Boolean),
    directions: instructions(o.recipeInstructions),
    nutritionText: nutritionText(o.nutrition),
    nutrition: parseNutrition(o.nutrition),
    servingsText: yieldOf(o.recipeYield ?? o.yield),
    prepTime: humanizeDuration(text(o.prepTime)),
    cookTime: humanizeDuration(text(o.cookTime)),
    totalTime: humanizeDuration(text(o.totalTime)),
    source: publisherName(o),
    image: imageOf(o.image),
    categories: [...new Set([...stringList(o.recipeCategory), ...stringList(o.recipeCuisine)].flatMap((s) => s.split(',')).map(clean).filter(Boolean))],
  };
}

function parseJsonLd(root, html) {
  const candidates = [];
  const scripts = root ? root.querySelectorAll('script').filter((s) => /ld\+json/i.test(s.getAttribute('type') ?? '')) : [];
  const raws = scripts.length ? scripts.map((s) => s.rawText)
    : [...String(html).matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const r of raws) {
    const raw = r.trim().replace(/^<!--/, '').replace(/-->$/, '').replace(/^\/\/<!\[CDATA\[/, '').replace(/\/\/\]\]>$/, '').trim();
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch {
      // Some sites emit control characters inside strings; try once more without them.
      try { parsed = JSON.parse(raw.replace(/[\u0000-\u001F]/g, ' ')); } catch { parsed = null; }
    }
    if (parsed) collectRecipes(parsed, candidates);
  }
  if (!candidates.length) return null;
  return fromJsonRecipe(candidates.sort((a, b) => scoreJson(b) - scoreJson(a))[0]);
}

// ───────────────────────── microdata
function parseMicrodata(root) {
  const scope = root.querySelectorAll('[itemtype]').find((e) => /schema\.org\/Recipe/i.test(e.getAttribute('itemtype') ?? ''));
  if (!scope) return null;
  const props = (name) => scope.querySelectorAll(`[itemprop="${name}"]`);
  const propText = (name) => {
    const e = props(name)[0];
    return e ? clean(e.getAttribute('content') || e.text) : '';
  };
  const timeOf = (n) => {
    const e = props(n)[0];
    return humanizeDuration(e ? (e.getAttribute('datetime') || e.getAttribute('content') || e.text) : '');
  };
  const directions = [...new Set(props('recipeInstructions').flatMap((el) => {
    const items = el.querySelectorAll('li, p, [itemprop="text"]');
    return items.length ? items.map((i) => clean(i.text)) : [clean(el.text)];
  }).filter(Boolean))];
  const img = props('image')[0];
  return {
    name: propText('name'),
    description: propText('description'),
    ingredients: [...props('recipeIngredient'), ...props('ingredients')].map((e) => clean(e.text)).filter(Boolean),
    directions,
    servingsText: propText('recipeYield'),
    prepTime: timeOf('prepTime'),
    cookTime: timeOf('cookTime'),
    totalTime: timeOf('totalTime'),
    image: img ? (img.getAttribute('src') || img.getAttribute('content') || '') : '',
    categories: props('recipeCategory').map((e) => clean(e.text || e.getAttribute('content') || '')).filter(Boolean),
  };
}

// ───────────────────────── heuristics
function bestList(body, pattern) {
  let best = [];
  for (const c of body.querySelectorAll('*')) {
    const tag = (c.tagName ?? '').toLowerCase();
    if (['body', 'html', 'script', 'style'].includes(tag)) continue;
    const key = `${c.getAttribute('class') ?? ''} ${c.getAttribute('id') ?? ''}`;
    if (!pattern.test(key)) continue;
    const items = c.querySelectorAll('li').map((e) => clean(e.text)).filter((s) => s && s.length < 600);
    const lines = items.length >= 2 ? items : c.querySelectorAll('p').map((e) => clean(e.text)).filter((s) => s && s.length < 1200);
    if (lines.length > best.length && lines.length < 80) best = lines;
  }
  return [...new Set(best)];
}

function parseHeuristics(root) {
  const body = root.querySelector('body') ?? root;
  const ingredients = bestList(body, /ingredient/i);
  const directions = bestList(body, /instruction|direction|method|preparation|steps/i);
  if (!ingredients.length && !directions.length) return null;
  return { name: clean(root.querySelector('h1')?.text ?? ''), ingredients, directions };
}

const FIELDS = ['name', 'description', 'ingredients', 'directions', 'nutritionText', 'nutrition', 'servingsText', 'prepTime', 'cookTime', 'totalTime', 'source', 'image', 'categories'];
function merge(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const k of FIELDS) {
    const empty = out[k] == null || out[k] === '' || (Array.isArray(out[k]) && !out[k].length);
    if (empty && b[k] != null) out[k] = b[k];
  }
  return out;
}

function meta(root, name) {
  const e = root.querySelectorAll('meta').find((m) => m.getAttribute('property') === name || m.getAttribute('name') === name);
  const v = e?.getAttribute('content')?.trim();
  return v || null;
}

function absolutize(img, base) {
  if (!img) return '';
  if (img.startsWith('//')) return `https:${img}`;
  if (/^https?:/i.test(img)) return img;
  try { return new URL(img, base).toString(); } catch { return img; }
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/**
 * Returns the recipe found on the page, or null when the page has no recipe.
 * Fields: name, description, ingredients[], directions[], nutritionText, nutrition (per serving),
 * servings (number|null), yieldLabel, prepTime, cookTime, totalTime, source, image, categories[], url.
 */
export function extractRecipe(html, url) {
  let root = null;
  try { root = parseHtml(String(html), { blockTextElements: { script: true, style: true, pre: true } }); } catch { root = null; }
  const fromJson = parseJsonLd(root, html);
  const fromMicro = root ? parseMicrodata(root) : null;
  const looks = (r) => !!r && (r.ingredients?.length > 0 || r.directions?.length > 0);
  const fromHeur = root && !looks(fromJson) && !looks(fromMicro) ? parseHeuristics(root) : null;
  const r = merge(merge(fromJson, fromMicro), fromHeur);
  if (!r || (!fromJson && !looks(r))) return null;

  if (!r.name && root) r.name = meta(root, 'og:title') ?? clean(root.querySelector('h1')?.text ?? '') ?? clean(root.querySelector('title')?.text ?? '');
  if (!r.image && root) r.image = meta(root, 'og:image') ?? '';
  if (!r.description && root) r.description = meta(root, 'og:description') ?? meta(root, 'description') ?? '';
  if (!r.source) r.source = (root && meta(root, 'og:site_name')) || hostOf(url);
  const servingsText = r.servingsText ?? '';
  const n = firstNumber(servingsText);
  return {
    name: clean(r.name || 'Imported recipe').slice(0, 160),
    description: clean(r.description ?? '').slice(0, 2000),
    ingredients: (r.ingredients ?? []).slice(0, 120),
    directions: (r.directions ?? []).slice(0, 80),
    nutritionText: r.nutritionText ?? '',
    nutrition: r.nutrition ?? null,
    servings: n && n > 0 && n <= 100 ? Math.round(n) : null,
    yieldLabel: servingsText || null,
    prepTime: r.prepTime ?? '',
    cookTime: r.cookTime ?? '',
    totalTime: r.totalTime ?? '',
    source: clean(r.source ?? ''),
    image: absolutize(r.image ?? '', url) || null,
    categories: (r.categories ?? []).slice(0, 20),
    url,
  };
}
