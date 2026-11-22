// Draft a whole recipe from photos with the OpenAI API: either a photo of a dish (the recipe is
// reconstructed and its nutrition estimated) or photos of a written recipe (cookbook page, card,
// screenshot), which are transcribed. The result is only a draft for the user to review and tweak.
import type { Nutrients, RecipeSnapshot } from '../../data/types';
import { openAiJson } from '../foodPhoto.ts';
import { humanizeDuration } from './durations.ts';

export type RecipePhotoKind = 'dish' | 'written_recipe' | 'not_food';

export interface AiRecipe {
  kind: RecipePhotoKind;
  recipe: RecipeSnapshot;
  note: string;
  model: string;
}

const num = { type: 'number' } as const;
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'name', 'description', 'servings', 'ingredients', 'directions', 'prepMinutes', 'cookMinutes', 'perServing', 'categories', 'note'],
  properties: {
    kind: { type: 'string', enum: ['dish', 'written_recipe', 'not_food'], description: 'What the photos show.' },
    name: { type: 'string' },
    description: { type: 'string', description: 'One or two sentences about the dish.' },
    servings: { type: 'number', description: 'How many servings the recipe makes.' },
    ingredients: {
      type: 'array', items: { type: 'string' },
      description: 'One ingredient per line with quantity and unit first, e.g. "200 g spaghetti", "2 tbsp olive oil". Section headers end with a colon, e.g. "Sauce:".',
    },
    directions: { type: 'array', items: { type: 'string' }, description: 'One step per item, in order. Include times and temperatures ("Bake 25 minutes at 200°C").' },
    prepMinutes: { type: 'number', description: '0 if unknown' },
    cookMinutes: { type: 'number', description: '0 if unknown' },
    perServing: {
      type: 'object', additionalProperties: false,
      required: ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodiumMg'],
      properties: { kcal: num, protein: num, carbs: num, fat: num, fiber: num, sugar: num, satFat: num, sodiumMg: num },
      description: 'Nutrition for ONE serving, grams except kcal and sodium in mg.',
    },
    categories: { type: 'array', items: { type: 'string' }, description: '1–3 short categories, e.g. "Dinner", "Pasta", "Vegetarian".' },
    note: { type: 'string', description: 'One short sentence on what was assumed or guessed, or why no recipe was produced.' },
  },
} as const;

const INSTRUCTIONS = [
  'You turn photos into a recipe for a home cooking and food-logging app.',
  'First decide what the photos show. If they show a written recipe (cookbook page, recipe card, handwritten note, screenshot), set kind "written_recipe" and transcribe it faithfully: keep its name, servings, ingredient quantities and steps, combining several photos in order. Only estimate what it leaves out (e.g. nutrition, times).',
  'If they show a prepared dish, set kind "dish" and write a realistic home recipe that would produce what is shown: identify the components, choose sensible quantities for the servings you see (the plate, cutlery and hands give scale), and include cooking fats and sauces that are visible or typical.',
  'If there is no food or recipe, set kind "not_food", leave the lists empty, use 0 for numbers and explain in the note.',
  'Estimate nutrition per serving from the ingredient quantities using typical reference values (e.g. USDA). Round kcal and sodium to whole numbers and grams to one decimal.',
  'Use metric quantities unless the written recipe uses others. Write in the language of the written recipe, or of the user\'s note if given, otherwise English.',
].join(' ');

interface Raw {
  kind: RecipePhotoKind; name: string; description: string; servings: number; ingredients: string[]; directions: string[];
  prepMinutes: number; cookMinutes: number; perServing: Nutrients & { fiber: number; sugar: number; satFat: number; sodiumMg: number };
  categories: string[]; note: string;
}

const r1 = (v: number) => Math.max(0, Math.round((Number(v) || 0) * 10) / 10);
const minutes = (m: number) => (m > 0 ? humanizeDuration(`PT${Math.round(m)}M`) : '');

/** Turn the model's answer into a recipe draft (exported for tests). */
export function toDraft(x: Raw): Omit<AiRecipe, 'model'> {
  const n = x.perServing;
  const hasNutrition = x.kind !== 'not_food' && Number(n?.kcal) > 0;
  const recipe: RecipeSnapshot = {
    name: (x.name || '').trim().slice(0, 120),
    description: (x.description || '').trim(),
    ingredients: (x.ingredients ?? []).map((l) => l.trim()).filter(Boolean).join('\n'),
    directions: (x.directions ?? []).map((l) => l.trim()).filter(Boolean).join('\n'),
    notes: '',
    nutrition: '',
    perServing: hasNutrition ? {
      kcal: Math.round(n.kcal), protein: r1(n.protein), carbs: r1(n.carbs), fat: r1(n.fat),
      fiber: r1(n.fiber), sugar: r1(n.sugar), satFat: r1(n.satFat), sodiumMg: Math.round(Math.max(0, n.sodiumMg || 0)),
    } : null,
    perServingSource: hasNutrition ? 'ai' : null,
    servings: x.servings > 0 ? `${Math.round(x.servings)} serving${Math.round(x.servings) === 1 ? '' : 's'}` : '',
    prepTime: minutes(x.prepMinutes),
    cookTime: minutes(x.cookMinutes),
    totalTime: x.prepMinutes > 0 && x.cookMinutes > 0 ? minutes(x.prepMinutes + x.cookMinutes) : '',
    difficulty: '',
    source: '',
    sourceUrl: '',
    imageUrl: '',
    photos: [],
    categories: [...new Set((x.categories ?? []).map((c) => c.trim()).filter(Boolean))].slice(0, 3),
  };
  return { kind: x.kind, recipe, note: x.note ?? '' };
}

/** Send 1–4 photos (data or https URLs) and get back a recipe draft. */
export async function recipeFromPhotos(
  images: string[],
  opts: { key: string; model: string; hint?: string; signal?: AbortSignal },
): Promise<AiRecipe> {
  const content: unknown[] = images.slice(0, 4).map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } }));
  if (opts.hint?.trim()) content.unshift({ type: 'text', text: `Note from the user: ${opts.hint.trim().slice(0, 500)}` });
  const { data, model } = await openAiJson<Raw>(INSTRUCTIONS, content, { name: 'recipe_from_photo', schema: SCHEMA }, opts);
  return { ...toDraft(data), model };
}
