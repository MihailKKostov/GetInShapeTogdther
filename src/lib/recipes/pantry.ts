import type { PantryItem } from '../../data/types';
import { ingredientKey, normalizeName } from './ingredients.ts';

/** True if an ingredient line appears to be covered by an in-stock pantry item. (RecipeMan: Repository.inPantry) */
export function inPantry(line: string, pantry: PantryItem[]): boolean {
  const key = ingredientKey(line);
  if (!key) return false;
  return pantry.some((p) => {
    if (!p.inStock) return false;
    const pk = normalizeName(p.name);
    return !!pk && (key === pk || key.endsWith(` ${pk}`) || key.split(' ').includes(pk) || pk.endsWith(` ${key}`));
  });
}
