// Live data hooks for the recipe screens.
import { doc, query, where } from 'firebase/firestore';
import { groceryItemsCol, groceryListsCol, mealPlanCol, menusCol, pantryCol, recipesCol } from '../../data/recipes';
import type { GroceryItem, GroceryList, PantryItem, PlannedMeal, Recipe, RecipeMenu } from '../../data/types';
import { useDoc, useQuery } from '../../hooks/useFirestore';

export const useRecipes = (uid: string) => useQuery<Recipe>(query(recipesCol(uid)), `recipes:${uid}`);
export const useRecipe = (uid: string, id: string | undefined) =>
  useDoc<Recipe>(id ? doc(recipesCol(uid), id) : null, `recipe:${uid}:${id}`);
export function useGroceryLists(uid: string) {
  // Sorted here rather than in the query, so a just-created list shows before the server confirms it.
  const q = useQuery<GroceryList>(query(groceryListsCol(uid)), `glists:${uid}`);
  const ms = (l: GroceryList) => l.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
  return { ...q, data: [...q.data].sort((a, b) => ms(a) - ms(b)) };
}
export const useGroceryItems = (uid: string) => useQuery<GroceryItem>(query(groceryItemsCol(uid)), `gitems:${uid}`);
export const usePantry = (uid: string) => useQuery<PantryItem>(query(pantryCol(uid)), `pantry:${uid}`);
export const useMenus = (uid: string) => useQuery<RecipeMenu>(query(menusCol(uid)), `menus:${uid}`);
export const useMealPlan = (uid: string, from: string, to: string) =>
  useQuery<PlannedMeal>(query(mealPlanCol(uid), where('date', '>=', from), where('date', '<=', to)), `plan:${uid}:${from}:${to}`);
