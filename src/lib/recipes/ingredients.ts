// Ingredient lines: quantity parsing, scaling, unit conversion and combining.
// Ported from RecipeMan (parse/Ingredients.kt).

export type UnitSystem = 'original' | 'metric' | 'us';

export interface ParsedIngredient {
  quantity: number | null;
  quantityEnd: number | null;
  unit: string | null;
  /** Text after the quantity and unit, e.g. "all-purpose flour, sifted". */
  rest: string;
  original: string;
  /** Quantity written as a count like "2x Peppers". */
  times: boolean;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5',
  '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

const NUM = '(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:[.,]\\d+)?)';
const QUANTITY_RE = new RegExp(`^\\s*(${NUM})(?:\\s*(?:-|–|—|to)\\s*(${NUM}))?(?=\\s|[a-zA-Z(]|$)\\s*(.*)$`, 'i');

/** Canonical unit → spellings. */
const UNIT_ALIASES: Record<string, string[]> = {
  tsp: ['teaspoons', 'teaspoon', 'tsps', 'tsp.', 'tsp', 't'],
  tbsp: ['tablespoons', 'tablespoon', 'tbsps', 'tbsp.', 'tbsp', 'tbs.', 'tbs', 'tbl', 'T'],
  cup: ['cups', 'cup', 'c.', 'c'],
  'fl oz': ['fluid ounces', 'fluid ounce', 'fl. oz.', 'fl. oz', 'fl oz', 'floz'],
  pint: ['pints', 'pint', 'pt'],
  quart: ['quarts', 'quart', 'qt'],
  gallon: ['gallons', 'gallon', 'gal'],
  oz: ['ounces', 'ounce', 'oz.', 'oz'],
  lb: ['pounds', 'pound', 'lbs.', 'lbs', 'lb.', 'lb'],
  g: ['grams', 'gram', 'gr', 'g'],
  kg: ['kilograms', 'kilogram', 'kgs', 'kg'],
  mg: ['milligrams', 'milligram', 'mg'],
  ml: ['milliliters', 'millilitres', 'milliliter', 'millilitre', 'mls', 'ml'],
  l: ['liters', 'litres', 'liter', 'litre', 'l'],
  cl: ['cl'],
  dl: ['dl'],
  clove: ['cloves', 'clove'],
  can: ['cans', 'can'],
  pinch: ['pinches', 'pinch'],
  dash: ['dashes', 'dash'],
  stick: ['sticks', 'stick'],
  package: ['packages', 'package', 'pkg', 'pkgs'],
  slice: ['slices', 'slice'],
  bunch: ['bunches', 'bunch'],
  head: ['heads', 'head'],
  sprig: ['sprigs', 'sprig'],
  jar: ['jars', 'jar'],
  bottle: ['bottles', 'bottle'],
  piece: ['pieces', 'piece'],
  handful: ['handfuls', 'handful'],
};

const UNIT_LOOKUP: [string, string][] = Object.entries(UNIT_ALIASES)
  .flatMap(([canon, names]) => names.map((n) => [n, canon] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

export function isHeader(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('#')) return true;
  return t.endsWith(':') && t.length <= 60 && !/^\d/.test(t);
}

export function headerText(line: string): string {
  return line.trim().replace(/^#+/, '').trim();
}

export function normalizeFractions(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const f = UNICODE_FRACTIONS[s[i]];
    if (f) {
      if (i > 0 && /\d/.test(s[i - 1])) out += ' ';
      out += f;
    } else out += s[i];
  }
  return out.replace(/⁄/g, '/');
}

export function parseNumber(s: string): number | null {
  const t = s.trim().replace(',', '.');
  const parts = t.split(/\s+/);
  if (parts.length === 2) {
    const a = parseNumber(parts[0]);
    const b = parseNumber(parts[1]);
    return a == null || b == null ? null : a + b;
  }
  if (t.includes('/')) {
    const [a, b] = t.split('/').map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return a / b;
  }
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : null;
}

function takeUnit(text: string): [string | null, string] {
  for (const [alias, canon] of UNIT_LOOKUP) {
    if (text.length < alias.length) continue;
    const head = text.slice(0, alias.length);
    const caseSensitive = alias === 'T' || alias === 't';
    const matches = caseSensitive ? head === alias : head.toLowerCase() === alias.toLowerCase();
    if (!matches) continue;
    const next = text[alias.length];
    if (next !== undefined && /\p{L}/u.test(next)) continue;
    let rest = text.slice(alias.length).replace(/^[.\s]+/, '');
    rest = rest.replace(/^of /, '').trim();
    return [canon, rest];
  }
  return [null, text.trim()];
}

export function parseIngredient(line: string): ParsedIngredient {
  const norm = normalizeFractions(line.trim()).replace(/^[-*•\s]+/, '');
  const m = QUANTITY_RE.exec(norm);
  if (!m) {
    const [unit, rest] = takeUnit(norm);
    return { quantity: null, quantityEnd: null, unit, rest, original: line, times: false };
  }
  const q = parseNumber(m[1]);
  const q2 = m[2]?.trim() ? parseNumber(m[2]) : null;
  let remainder = m[3];
  const timesMatch = /^[x×]\s+/.exec(remainder);
  if (timesMatch) remainder = remainder.slice(timesMatch[0].length);
  // Keep a parenthetical package size, e.g. "1 (14 oz) can tomatoes" keeps "can" as unit.
  const paren = /^\(([^)]*)\)\s*/.exec(remainder);
  const parenText = paren?.[0] ?? '';
  if (paren) remainder = remainder.slice(paren[0].length);
  const [unit, rest] = takeUnit(remainder);
  return { quantity: q, quantityEnd: q2, unit, rest: (parenText + rest).trim(), original: line, times: !!timesMatch };
}

const DESCRIPTOR_WORDS = new Set([
  'fresh', 'freshly', 'large', 'small', 'medium', 'chopped', 'diced', 'minced', 'sliced', 'ground', 'grated',
  'shredded', 'melted', 'softened', 'room', 'temperature', 'finely', 'roughly', 'coarsely', 'thinly', 'packed',
  'lightly', 'beaten', 'peeled', 'optional', 'to', 'taste', 'divided', 'plus', 'more', 'for', 'serving',
  'cold', 'warm', 'hot', 'boneless', 'skinless', 'extra', 'virgin', 'unsalted', 'salted', 'dried', 'whole',
  'cut', 'into', 'pieces', 'inch', 'cubes', 'about', 'and', 'or', 'the', 'a', 'of', 'organic', 'crushed',
]);

function singularize(s: string): string {
  if (s.length < 4) return s;
  if (s.endsWith('oes')) return s.slice(0, -2);
  if (s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.endsWith('ches') || s.endsWith('shes')) return s.slice(0, -2);
  if (s.endsWith('ss')) return s;
  if (s.endsWith('s')) return s.slice(0, -1);
  return s;
}

/** Normalized ingredient name used for matching ("flour" for "2 cups all-purpose flour, sifted"). */
export function normalizeName(rest: string): string {
  let t = rest.toLowerCase().replace(/\([^)]*\)/g, ' ');
  t = t.split(',')[0].split(';')[0];
  const words = t.split(/[^a-z'-]+/).filter((w) => w && !DESCRIPTOR_WORDS.has(w));
  return singularize(words.join(' ').trim());
}

export function ingredientKey(line: string): string {
  return normalizeName(parseIngredient(line).rest);
}

// ───────────────────────── formatting

const NICE_FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

export function trimDecimal(q: number, places = 2): string {
  const s = q.toFixed(places).replace(/0+$/, '').replace(/\.$/, '');
  return s || '0';
}

export function formatQuantity(q: number): string {
  if (q <= 0) return '0';
  const whole = Math.floor(q);
  const frac = q - whole;
  if (frac < 0.03) return String(whole);
  if (frac > 0.97) return String(whole + 1);
  const nice = NICE_FRACTIONS.reduce((best, f) => (Math.abs(f[0] - frac) < Math.abs(best[0] - frac) ? f : best));
  if (Math.abs(nice[0] - frac) < 0.03) return whole === 0 ? nice[1] : `${whole} ${nice[1]}`;
  return trimDecimal(q);
}

function displayUnit(unit: string, q: number): string {
  const plural = q > 1.0001;
  if (['cup', 'pint', 'quart', 'gallon', 'clove', 'can', 'stick', 'package', 'slice', 'head', 'sprig', 'jar', 'bottle', 'piece', 'handful'].includes(unit)) {
    return plural ? `${unit}s` : unit;
  }
  if (['bunch', 'pinch', 'dash'].includes(unit)) return plural ? `${unit}es` : unit;
  return unit;
}

function formatConverted(q: number, unit: string): string {
  if (unit === 'g' || unit === 'ml') {
    if (q >= 100) return String(Math.round(q / 5) * 5);
    if (q >= 10) return String(Math.round(q));
    return trimDecimal(q, 1);
  }
  if (unit === 'kg' || unit === 'l') return trimDecimal(q, 2);
  return formatQuantity(q);
}

const ML_PER: Record<string, number> = { tsp: 4.92892, tbsp: 14.7868, cup: 236.588, 'fl oz': 29.5735, pint: 473.176, quart: 946.353, gallon: 3785.41, ml: 1, l: 1000, cl: 10, dl: 100 };
const G_PER: Record<string, number> = { oz: 28.3495, lb: 453.592, g: 1, kg: 1000, mg: 0.001 };
const METRIC_VOLUME = new Set(['ml', 'l', 'cl', 'dl']);

function convert(q: number, unit: string, system: UnitSystem): [number, string] | null {
  if (system === 'metric') {
    if (ML_PER[unit] != null) {
      if (METRIC_VOLUME.has(unit) || unit === 'tsp' || unit === 'tbsp') return null; // spoons are common in metric kitchens too
      const ml = q * ML_PER[unit];
      return ml >= 1000 ? [ml / 1000, 'l'] : [ml, 'ml'];
    }
    if (G_PER[unit] != null) {
      if (unit === 'g' || unit === 'kg' || unit === 'mg') return null;
      const g = q * G_PER[unit];
      return g >= 1000 ? [g / 1000, 'kg'] : [g, 'g'];
    }
  } else if (system === 'us') {
    if (ML_PER[unit] != null) {
      if (!METRIC_VOLUME.has(unit)) return null;
      const ml = q * ML_PER[unit];
      if (ml < 14) return [ml / ML_PER.tsp, 'tsp'];
      if (ml < 59) return [ml / ML_PER.tbsp, 'tbsp'];
      return [ml / ML_PER.cup, 'cup'];
    }
    if (G_PER[unit] != null) {
      if (unit !== 'g' && unit !== 'kg') return null;
      const g = q * G_PER[unit];
      return g < 454 ? [g / G_PER.oz, 'oz'] : [g / G_PER.lb, 'lb'];
    }
  }
  return null;
}

/** Scales an ingredient line by `factor` and optionally converts units. Lines without quantities are untouched. */
export function transformIngredient(line: string, factor: number, system: UnitSystem = 'original'): string {
  if (isHeader(line)) return line;
  if (factor === 1 && system === 'original') return line;
  const p = parseIngredient(line);
  if (p.quantity == null) return line;
  let q = p.quantity * factor;
  let q2 = p.quantityEnd != null ? p.quantityEnd * factor : null;
  let unit = p.unit;
  if (system !== 'original' && unit) {
    const converted = convert(q, unit, system);
    if (converted) {
      const ratio = converted[0] / q;
      q = converted[0];
      q2 = q2 != null ? q2 * ratio : null;
      unit = converted[1];
      const qs = formatConverted(q, unit) + (q2 != null ? `–${formatConverted(q2, unit)}` : '');
      return `${qs} ${unit} ${p.rest}`.trim();
    }
  }
  const qs = formatQuantity(q) + (q2 != null ? `–${formatQuantity(q2)}` : '') + (p.times ? 'x' : '');
  const unitText = unit ? displayUnit(unit, q2 ?? q) : null;
  return [qs, unitText, p.rest || null].filter(Boolean).join(' ');
}

/** Parses a servings/yield string ("4 servings", "Makes 24 cookies") into a number, if possible. */
export function servingsNumber(servings: string | undefined | null): number | null {
  if (!servings) return null;
  const m = /(\d+(?:[.,]\d+)?)/.exec(normalizeFractions(servings));
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n > 0 ? n : null;
}

/** Combines two grocery lines if they describe the same ingredient in compatible units. */
export function combineIngredients(a: string, b: string): string | null {
  const pa = parseIngredient(a);
  const pb = parseIngredient(b);
  const ka = normalizeName(pa.rest);
  if (!ka || ka !== normalizeName(pb.rest)) return null;
  if (pa.quantity == null || pb.quantity == null) return null;
  if (pa.quantityEnd != null || pb.quantityEnd != null) return null;
  if (pa.unit !== pb.unit) return null;
  const total = pa.quantity + pb.quantity;
  const unitText = pa.unit ? displayUnit(pa.unit, total) : null;
  return [formatQuantity(total), unitText, pa.rest || null].filter(Boolean).join(' ');
}

export function roundForDisplay(d: number): string {
  return Math.abs(d - Math.round(d)) < 0.01 ? String(Math.round(d)) : trimDecimal(d);
}

/** Splits stored ingredient text into lines (one ingredient per line). */
export function ingredientLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** Splits stored directions into steps (blank-line or newline separated). */
export function directionSteps(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
