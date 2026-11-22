// Reads per-serving nutrition out of free text such as RecipeMan's
// "Calories: 350\nProtein: 20 g" or Paprika's "Calories 350 kcal, Fat 12g …".
import type { Nutrients } from '../../data/types';

const FIELDS: [keyof Nutrients, RegExp][] = [
  ['kcal', /\b(?:calories|energy|kcal)\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(kcal|cal|kj)?/i],
  ['protein', /\bprotein\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(mg|g)?/i],
  ['carbs', /\b(?:total\s+)?carb(?:ohydrate)?s?\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(mg|g)?/i],
  ['satFat', /\bsat(?:urated)?\.?\s*fat\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(mg|g)?/i],
  ['fat', /\b(?:total\s+)?fat\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(mg|g)?/i],
  ['fiber', /\bfib(?:er|re)\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(mg|g)?/i],
  ['sugar', /\bsugars?\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(mg|g)?/i],
  ['sodiumMg', /\bsodium\b[^\d\n]{0,12}(\d+(?:[.,]\d+)?)\s*(mg|g)?/i],
];

/** Returns whatever nutrients could be read, or null when there are no calories. */
export function parseNutritionText(text: string | null | undefined): Partial<Nutrients> | null {
  if (!text) return null;
  // "Saturated fat" must not be read as "fat": take total fat from lines that don't mention saturated/trans.
  const lines = text.split(/\r?\n|;|,(?=\s*[A-Za-z])/);
  const out: Partial<Nutrients> = {};
  for (const [key, re] of FIELDS) {
    for (const line of lines) {
      if (key === 'fat' && /sat|trans|unsat|mono|poly/i.test(line)) continue;
      if (key === 'sugar' && /added|alcohol/i.test(line) && out.sugar != null) continue;
      const m = re.exec(line);
      if (!m) continue;
      let v = Number(m[1].replace(',', '.'));
      const unit = (m[2] ?? '').toLowerCase();
      if (key === 'kcal' && unit === 'kj') v /= 4.184;
      if (key === 'sodiumMg' && unit === 'g') v *= 1000;
      if (key !== 'sodiumMg' && key !== 'kcal' && unit === 'mg') v /= 1000;
      (out[key] as number) = key === 'kcal' || key === 'sodiumMg' ? Math.round(v) : Math.round(v * 10) / 10;
      break;
    }
  }
  return out.kcal != null ? out : null;
}

const LABELS: [keyof Nutrients, string, string][] = [
  ['kcal', 'Calories', 'kcal'], ['fat', 'Fat', 'g'], ['satFat', 'Saturated fat', 'g'], ['sodiumMg', 'Sodium', 'mg'],
  ['carbs', 'Carbohydrates', 'g'], ['fiber', 'Fiber', 'g'], ['sugar', 'Sugar', 'g'], ['protein', 'Protein', 'g'],
];

/** The inverse: structured nutrients back to RecipeMan-style text. */
export function nutritionToText(n: Partial<Nutrients> | null | undefined): string {
  if (!n) return '';
  return LABELS.filter(([k]) => n[k] != null).map(([k, label, unit]) => `${label}: ${n[k]} ${unit}`).join('\n');
}
