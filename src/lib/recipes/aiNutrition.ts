import type { Nutrients, RecipeSnapshot } from '../../data/types';
import { analyzeFoodText } from '../foodPhoto';
import { ingredientLines, isHeader, servingsNumber } from './ingredients.ts';

/** Ask OpenAI for the whole recipe's nutrition and divide by the servings. */
export async function estimateRecipeNutrition(r: RecipeSnapshot, opts: { key: string; model: string; servings?: number }): Promise<Nutrients> {
  const lines = ingredientLines(r.ingredients).filter((l) => !isHeader(l));
  if (!lines.length) throw new Error('Add ingredients first');
  const servings = opts.servings ?? servingsNumber(r.servings) ?? 1;
  const res = await analyzeFoodText(
    `The complete recipe "${r.name}" (makes ${servings} serving${servings === 1 ? '' : 's'}). Estimate each ingredient below for the FULL amount listed, as used in the dish:\n${lines.join('\n')}`,
    opts,
  );
  if (!res.items.length) throw new Error(res.note || 'Could not estimate this recipe');
  const sum = (k: keyof Nutrients) => res.items.reduce((s, i) => s + ((i as unknown as Record<string, number>)[k] ?? 0), 0);
  const per = (v: number) => Math.round((v / servings) * 10) / 10;
  return { kcal: Math.round(sum('kcal') / servings), protein: per(sum('protein')), carbs: per(sum('carbs')), fat: per(sum('fat')), fiber: per(sum('fiber')) };
}
