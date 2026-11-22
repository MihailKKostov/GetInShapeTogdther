// Estimate foods and nutrition from a meal photo or a written description with the OpenAI API.
// The API key is the user's own and lives only on their device (see aiSettings below);
// requests go straight from the browser to OpenAI, never through WeFit's servers.

export interface PhotoItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface PhotoResult {
  items: PhotoItem[];
  note: string;
  model: string;
}

export const AI_MODELS = [
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini (fast, recommended)' },
  { id: 'gpt-5.5', label: 'gpt-5.5 (most accurate, slower)' },
  { id: 'gpt-5.4-nano', label: 'gpt-5.4-nano (cheapest)' },
];
export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

// ───────────────────────── per-device settings (never synced)
const KEY = 'wefit.openai.key';
const MODEL = 'wefit.openai.model';

export const aiSettings = {
  getKey(): string {
    try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
  },
  setKey(v: string) {
    try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event('wefit:ai-settings'));
  },
  getModel(): string {
    try { return localStorage.getItem(MODEL) || DEFAULT_AI_MODEL; } catch { return DEFAULT_AI_MODEL; }
  },
  setModel(v: string) {
    try { localStorage.setItem(MODEL, v); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event('wefit:ai-settings'));
  },
};

export class AiError extends Error {}

const API = 'https://api.openai.com/v1';

function explain(status: number, body: string): string {
  let msg = '';
  try { msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* not JSON */ }
  if (status === 401) return 'OpenAI rejected the API key. Check it in Settings → AI food estimates.';
  if (status === 429) return /quota|billing/i.test(msg)
    ? 'Your OpenAI account is out of credit. Add billing at platform.openai.com.'
    : 'OpenAI is rate-limiting requests. Wait a moment and try again.';
  if (status === 404 || /model/i.test(msg)) return `That model isn't available on your OpenAI account${msg ? ` (${msg})` : ''}. Pick another in Settings.`;
  return `OpenAI error ${status}${msg ? `: ${msg}` : ''}`;
}

/** Quick key check: lists models (free). Returns null when OK, otherwise an error message. */
export async function testKey(key: string, model: string): Promise<string | null> {
  const res = await fetch(`${API}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${key}` } })
    .catch(() => null);
  if (!res) return 'Couldn\'t reach OpenAI. Check your connection.';
  if (res.ok) return null;
  return explain(res.status, await res.text());
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'note'],
  properties: {
    note: { type: 'string', description: 'One short sentence: assumptions made, or why nothing was found.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'confidence'],
        properties: {
          name: { type: 'string', description: 'Short food name, e.g. "Fried egg" or "Sourdough toast, buttered"' },
          grams: { type: 'number', description: 'Estimated edible portion in grams (ml for drinks)' },
          kcal: { type: 'number' },
          protein: { type: 'number', description: 'grams' },
          carbs: { type: 'number', description: 'grams' },
          fat: { type: 'number', description: 'grams' },
          fiber: { type: 'number', description: 'grams' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = [
  'You are a careful nutrition assistant for a food-logging app.',
  'Identify each distinct food or drink visible in the photo and estimate the portion actually on the plate in grams.',
  'Estimate nutrition for that portion using typical reference values (e.g. USDA). Include cooking oil, butter and sauces you can see or that are typical for the dish.',
  'Use the plate, cutlery and hands for scale. Split mixed plates into components when that is clearer (e.g. "Spaghetti", "Bolognese sauce").',
  'Numbers must be for the estimated portion, not per 100 g. Round grams to the nearest 5 and nutrients to whole numbers.',
  'If the photo contains no food, return an empty list and say so in the note.',
].join(' ');

const TEXT_INSTRUCTIONS = [
  'You are a careful nutrition assistant for a food-logging app.',
  'The user describes what they ate or drank in their own words (any language). Split it into distinct foods and drinks.',
  'Use the quantities they give (e.g. "2 eggs", "a large bowl", "200 g", "a pint"); convert them to grams (ml for drinks).',
  'When no amount is given, assume one typical single serving and mention that assumption in the note.',
  'Estimate nutrition for that portion using typical reference values (e.g. USDA), including cooking fat when the preparation implies it (fried, buttered, creamy).',
  'For restaurant or branded items, use typical published values for that item.',
  'Numbers must be for the stated portion, not per 100 g. Round grams to the nearest 5 and nutrients to whole numbers.',
  'If the text is not about food or drink, return an empty list and say so in the note. Write food names in the user\'s language.',
].join(' ');

/** Send a photo (data URL or https URL) to OpenAI and get back estimated items. */
export function analyzeFoodPhoto(
  image: string,
  opts: { key: string; model: string; hint?: string; signal?: AbortSignal },
): Promise<PhotoResult> {
  const content: unknown[] = [{ type: 'image_url', image_url: { url: image, detail: 'high' } }];
  if (opts.hint?.trim()) content.unshift({ type: 'text', text: `Extra context from the user: ${opts.hint.trim().slice(0, 300)}` });
  return estimate(INSTRUCTIONS, content, opts);
}

/** Estimate foods and nutrition from a written description of a meal. */
export function analyzeFoodText(
  description: string,
  opts: { key: string; model: string; signal?: AbortSignal },
): Promise<PhotoResult> {
  return estimate(TEXT_INSTRUCTIONS, [{ type: 'text', text: description.trim().slice(0, 1500) }], opts);
}

async function estimate(
  instructions: string,
  content: unknown[],
  opts: { key: string; model: string; signal?: AbortSignal },
): Promise<PhotoResult> {
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    signal: opts.signal,
    headers: { Authorization: `Bearer ${opts.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: instructions },
        { role: 'user', content },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'meal_estimate', strict: true, schema: SCHEMA } },
    }),
  }).catch((e) => {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new AiError('Couldn\'t reach OpenAI. Check your connection.');
  });
  const body = await res.text();
  if (!res.ok) throw new AiError(explain(res.status, body));
  const data = JSON.parse(body) as { model?: string; choices?: { message?: { content?: string; refusal?: string } }[] };
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) throw new AiError(`OpenAI declined: ${msg.refusal}`);
  let parsed: { items?: PhotoItem[]; note?: string };
  try { parsed = JSON.parse(msg?.content ?? ''); } catch { throw new AiError('OpenAI returned an unexpected answer. Try again.'); }
  const items = (parsed.items ?? [])
    .filter((i) => i && i.name && Number.isFinite(i.kcal))
    .map((i) => ({
      name: String(i.name).slice(0, 80),
      grams: Math.max(0, Math.round(i.grams)),
      kcal: Math.max(0, Math.round(i.kcal)),
      protein: Math.max(0, Math.round(i.protein)),
      carbs: Math.max(0, Math.round(i.carbs)),
      fat: Math.max(0, Math.round(i.fat)),
      fiber: Math.max(0, Math.round(i.fiber)),
      confidence: (['high', 'medium', 'low'] as const).includes(i.confidence) ? i.confidence : 'medium',
    }));
  return { items, note: parsed.note ?? '', model: data.model ?? opts.model };
}
