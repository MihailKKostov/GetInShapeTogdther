// Reads Paprika exports in the browser. Ported from RecipeMan (parse/PaprikaFormat.kt).
//  - `.paprikarecipes`: a zip archive with one `.paprikarecipe` entry per recipe
//  - `.paprikarecipe`: a single gzip-compressed JSON recipe
// Plain (uncompressed) JSON is accepted too.
import type { RecipeSnapshot } from '../../data/types';
import { parseNutritionText } from './nutritionText.ts';

export interface PaprikaRecipe {
  uid: string;
  recipe: RecipeSnapshot;
  rating: number;
  created: number | null;
  mainPhoto: Blob | null;
  extraPhotos: Blob[];
}

async function inflate(data: Uint8Array, format: 'gzip' | 'deflate-raw'): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimal zip reader (central directory; stored and deflated entries). */
async function* zipEntries(buf: Uint8Array): AsyncGenerator<{ name: string; data: Uint8Array }> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This zip file is damaged');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + csize);
    if (method === 0) yield { name, data: raw };
    else if (method === 8) yield { name, data: await inflate(raw, 'deflate-raw') };
  }
}

async function readJson(bytes: Uint8Array): Promise<Record<string, unknown> | null> {
  const raw = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? await inflate(bytes, 'gzip') : bytes;
  const text = new TextDecoder().decode(raw).replace(/^[﻿\s]+/, '');
  if (!text.startsWith('{')) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function decodePhoto(b64: unknown): Blob | null {
  if (typeof b64 !== 'string' || !b64.trim()) return null;
  try {
    const bin = atob(b64.replace(/\s+/g, ''));
    if (bin.length <= 100) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const type = bytes[0] === 0x89 ? 'image/png' : 'image/jpeg';
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

const BULLET = /^\s*(?:[-–•*·]|●|▪)\s+/;
/** One ingredient per line: removes list bullets and blank spacer lines. */
export function cleanIngredients(s: string): string {
  return s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(BULLET, '').trim()).filter(Boolean).join('\n');
}
/** Normalizes line endings and collapses runs of blank lines to one. */
export function cleanParagraphs(s: string): string {
  return s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

export function parsePaprikaJson(j: Record<string, unknown>): PaprikaRecipe {
  const s = (key: string) => (j[key] == null ? '' : String(j[key]).trim());
  // "photos" holds full-size images; "photo_large" names the main one. "photo_data" is a smaller copy of the main photo.
  const entries = (Array.isArray(j.photos) ? j.photos : []).filter((p): p is Record<string, unknown> => !!p && typeof p === 'object');
  const largeName = s('photo_large');
  const mainEntry = entries.find((e) => largeName && e.filename === largeName);
  const main = decodePhoto(mainEntry?.data) ?? decodePhoto(j.photo_data) ?? entries.map((e) => decodePhoto(e.data)).find(Boolean) ?? null;
  const extras = entries.filter((e) => e !== mainEntry).map((e) => decodePhoto(e.data)).filter((b): b is Blob => !!b)
    .filter((b) => !main || b.size !== main.size);
  const nutrition = cleanParagraphs(s('nutritional_info'));
  const perServing = parseNutritionText(nutrition);
  return {
    uid: s('uid'),
    rating: Math.max(0, Math.min(5, Number(j.rating) || 0)),
    created: parseDate(s('created')),
    mainPhoto: main,
    extraPhotos: extras,
    recipe: {
      name: s('name') || 'Untitled recipe',
      description: s('description'),
      ingredients: cleanIngredients(s('ingredients')),
      directions: cleanParagraphs(s('directions')).split('\n').map((l) => l.trim()).filter(Boolean).join('\n'),
      notes: cleanParagraphs(s('notes')),
      nutrition,
      perServing: perServing && perServing.kcal != null
        ? { kcal: perServing.kcal, protein: perServing.protein ?? 0, carbs: perServing.carbs ?? 0, fat: perServing.fat ?? 0, ...perServing }
        : null,
      perServingSource: perServing ? 'recipe' : null,
      servings: s('servings'),
      prepTime: s('prep_time'),
      cookTime: s('cook_time'),
      totalTime: s('total_time'),
      difficulty: s('difficulty'),
      source: s('source'),
      sourceUrl: s('source_url'),
      imageUrl: s('image_url'),
      photos: [],
      categories: (Array.isArray(j.categories) ? j.categories : []).map((c) => String(c).trim()).filter(Boolean),
    },
  };
}

/** Reads every recipe in a Paprika export file. */
export async function readPaprikaExport(file: Blob): Promise<PaprikaRecipe[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const out: PaprikaRecipe[] = [];
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    for await (const e of zipEntries(buf)) {
      const base = e.name.split('/').pop() ?? '';
      if (base.startsWith('.') || e.name.includes('__MACOSX')) continue;
      const json = await readJson(e.data);
      if (json) out.push(parsePaprikaJson(json));
    }
    if (!out.length) throw new Error('No recipes found in this file');
    return out;
  }
  if ((buf[0] === 0x1f && buf[1] === 0x8b) || buf[0] === 0x7b) {
    const json = await readJson(buf);
    if (!json) throw new Error('Not a Paprika recipe file');
    return [parsePaprikaJson(json)];
  }
  throw new Error("This isn't a Paprika export. In Paprika, use Export and choose the .paprikarecipes format.");
}
