// Firestore access for the recipe features ported from RecipeMan:
// recipes, grocery lists, meal plan, pantry and menus (all private to the owner),
// plus logging recipes to the food diary and sharing them with friends.
import {
  collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db, loadStorage } from '../firebase';
import { randomId } from '../lib/avatar';
import { dateKey } from '../lib/dates';
import { resizeImage } from '../lib/images';
import { guessAisle } from '../lib/recipes/aisles';
import { combineIngredients, isHeader, parseIngredient } from '../lib/recipes/ingredients';
import { addFoodEntry, background, createPost, uploadImage } from './api';
import type {
  Food, FoodEntry, GroceryItem, Meal, Nutrients, PantryItem, PlannedMeal, Recipe, RecipeMenu, RecipePhoto,
  RecipeSnapshot,
} from './types';

export const recipesCol = (uid: string) => collection(db, 'users', uid, 'recipes');
export const groceryListsCol = (uid: string) => collection(db, 'users', uid, 'groceryLists');
export const groceryItemsCol = (uid: string) => collection(db, 'users', uid, 'groceryItems');
export const mealPlanCol = (uid: string) => collection(db, 'users', uid, 'mealPlan');
export const pantryCol = (uid: string) => collection(db, 'users', uid, 'pantry');
export const menusCol = (uid: string) => collection(db, 'users', uid, 'menus');

export const MEAL_LABELS: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snack' };

// ───────────────────────── recipes

export function emptyRecipe(): RecipeSnapshot {
  return {
    name: '', description: '', ingredients: '', directions: '', notes: '', nutrition: '', perServing: null, perServingSource: null,
    servings: '', prepTime: '', cookTime: '', totalTime: '', difficulty: '', source: '', sourceUrl: '', imageUrl: '',
    photos: [], categories: [],
  };
}

export function snapshotOf(r: RecipeSnapshot): RecipeSnapshot {
  const e = emptyRecipe();
  const out = { ...e } as RecipeSnapshot;
  for (const k of Object.keys(e) as (keyof RecipeSnapshot)[]) (out as unknown as Record<string, unknown>)[k] = r[k] ?? e[k];
  out.photos = (r.photos ?? []).map((p) => ({ url: p.url }));
  return out;
}

/** Create (id = null) or update a recipe. Returns its id immediately (the write syncs in the background). */
export function saveRecipe(uid: string, id: string | null, data: Partial<Recipe>): string {
  const ref = id ? doc(recipesCol(uid), id) : doc(recipesCol(uid));
  const clean: DocumentData = { ...data };
  delete clean.id;
  if (id) background(updateDoc(ref, { ...clean, updatedAt: serverTimestamp() }), 'your recipe');
  else {
    background(setDoc(ref, {
      ...emptyRecipe(), rating: 0, favorite: false, lastCookedAt: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...clean,
    }), 'your recipe');
  }
  return ref.id;
}

export function updateRecipe(uid: string, id: string, patch: Partial<Recipe>) {
  background(updateDoc(doc(recipesCol(uid), id), patch as DocumentData), 'your recipe');
}

export async function deleteRecipe(uid: string, r: Recipe) {
  const batch = writeBatch(db);
  batch.delete(doc(recipesCol(uid), r.id));
  // Like RecipeMan: remove the recipe from the meal plan and from menus.
  const planned = await getDocs(query(mealPlanCol(uid), where('recipeId', '==', r.id)));
  planned.docs.forEach((d) => batch.delete(d.ref));
  const menus = await getDocs(menusCol(uid));
  menus.docs.forEach((d) => {
    const m = d.data() as RecipeMenu;
    if (m.items?.some((i) => i.recipeId === r.id)) batch.update(d.ref, { items: m.items.filter((i) => i.recipeId !== r.id) });
  });
  background(batch.commit(), 'your recipe');
  const paths = [r.imagePath, ...(r.photos ?? []).map((p) => p.path)].filter((p): p is string => !!p);
  if (paths.length) {
    const { storage, ref, deleteObject } = await loadStorage();
    await Promise.all(paths.map((p) => deleteObject(ref(storage, p)).catch(() => undefined)));
  }
}

export async function uploadRecipePhoto(uid: string, file: Blob, onProgress?: (p: number) => void): Promise<RecipePhoto> {
  const img = await resizeImage(file, 1600, 'image/jpeg', 0.85);
  const path = `users/${uid}/recipes/${randomId(12)}.jpg`;
  const url = await uploadImage(path, img, onProgress);
  return { url, path };
}

export function markCooked(uid: string, id: string) {
  updateRecipe(uid, id, { lastCookedAt: Date.now() });
}

/** Copy a friend's recipe (from a post or their recipe book) into your own library. Their rating, favourite and cooking history stay theirs. */
export function saveSharedRecipe(uid: string, snap: RecipeSnapshot, from: { uid: string; name: string; postId?: string; recipeId?: string }): string {
  return saveRecipe(uid, null, { ...snapshotOf(snap), sharedFrom: from });
}

// ───────────────────────── diary logging

/** The recipe as a per-serving food for the diary. */
export function recipeFood(r: Pick<Recipe, 'id' | 'name' | 'perServing'>): Food {
  return {
    id: `recipe:${r.id}`, source: 'recipe', name: r.name, per100: r.perServing ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    servingG: 100, servingLabel: 'serving', perServing: true, brand: 'My recipe',
  };
}

function scale(n: Nutrients, k: number): Nutrients {
  const r1 = (v: number | undefined) => (v == null ? undefined : Math.round(v * k * 10) / 10);
  return {
    kcal: Math.round(n.kcal * k), protein: r1(n.protein)!, carbs: r1(n.carbs)!, fat: r1(n.fat)!,
    fiber: r1(n.fiber), sugar: r1(n.sugar), satFat: r1(n.satFat), sodiumMg: n.sodiumMg == null ? undefined : Math.round(n.sodiumMg * k),
  };
}

/** Log servings of a recipe to the food diary. Returns the diary entry id. */
export function logRecipe(uid: string, r: Pick<Recipe, 'id' | 'name' | 'perServing'>, date: string, meal: Meal, servings: number, entryId = randomId(12)): string {
  if (!r.perServing) throw new Error('Add nutrition per serving to this recipe first');
  const food = recipeFood(r);
  const entry: FoodEntry = {
    id: entryId, meal, foodId: food.id, source: 'recipe', name: r.name, brand: 'My recipe',
    grams: Math.round(servings * 100), servings, n: scale(r.perServing, servings), addedAt: Date.now(),
  };
  addFoodEntry(uid, date, entry, food);
  return entry.id;
}

/** Default meal for "now" (used when logging without choosing). */
export function mealForNow(d = new Date()): Meal {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snacks' : 'dinner';
}

// ───────────────────────── sharing

export async function shareRecipe(uid: string, r: RecipeSnapshot, text: string): Promise<string> {
  return createPost(uid, { kind: 'recipe', text, visibility: 'friends', recipe: snapshotOf(r) });
}

// ───────────────────────── grocery lists

export function createGroceryList(uid: string, name: string): string {
  const ref = doc(groceryListsCol(uid));
  background(setDoc(ref, { name: name.trim() || 'Groceries', createdAt: serverTimestamp() }), 'grocery list');
  return ref.id;
}

export function renameGroceryList(uid: string, id: string, name: string) {
  background(updateDoc(doc(groceryListsCol(uid), id), { name }), 'grocery list');
}

export function deleteGroceryList(uid: string, id: string, items: GroceryItem[]) {
  const batch = writeBatch(db);
  batch.delete(doc(groceryListsCol(uid), id));
  items.filter((i) => i.listId === id).forEach((i) => batch.delete(doc(groceryItemsCol(uid), i.id)));
  background(batch.commit(), 'grocery list');
}

/**
 * Adds ingredient lines to a list. Quantities of matching unchecked items are combined
 * ("1 cup flour" + "2 cups flour" = "3 cups flour"). (RecipeMan: Repository.addToGroceryList)
 */
export function addToGroceryList(uid: string, listId: string, lines: string[], recipeName: string, current: GroceryItem[]): number {
  return addLinesToGroceryList(uid, listId, lines.map((line) => ({ line, recipeName })), current);
}

/** Same as addToGroceryList, for lines from several recipes at once (e.g. a week's meal plan). */
export function addLinesToGroceryList(uid: string, listId: string, entries: { line: string; recipeName: string }[], current: GroceryItem[]): number {
  const existing = current.filter((i) => i.listId === listId && !i.checked).map((i) => ({ ...i }));
  const changed = new Map<string, GroceryItem>();
  let added = 0;
  for (const { line: raw, recipeName } of entries) {
    const line = raw.trim();
    if (!line || isHeader(line)) continue;
    const match = existing.find((it) => combineIngredients(it.name, line) != null);
    if (match) {
      match.name = combineIngredients(match.name, line)!;
      match.recipeName = [match.recipeName, recipeName].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
      changed.set(match.id, match);
    } else {
      const item: GroceryItem = {
        id: doc(groceryItemsCol(uid)).id, listId, name: line,
        aisle: guessAisle(parseIngredient(line).rest || line), recipeName, checked: false, createdAt: Date.now() + added,
      };
      existing.push(item);
      changed.set(item.id, item);
    }
    added++;
  }
  const batch = writeBatch(db);
  for (const it of changed.values()) {
    const { id, ...data } = it;
    batch.set(doc(groceryItemsCol(uid), id), data);
  }
  background(batch.commit(), 'grocery list');
  return added;
}

export function updateGroceryItem(uid: string, id: string, patch: Partial<GroceryItem>) {
  background(updateDoc(doc(groceryItemsCol(uid), id), patch as DocumentData), 'grocery list');
}

export function deleteGroceryItems(uid: string, ids: string[]) {
  const batch = writeBatch(db);
  ids.forEach((id) => batch.delete(doc(groceryItemsCol(uid), id)));
  background(batch.commit(), 'grocery list');
}

/** Bought items go to the pantry (in stock, purchased today) and leave the list. */
export function moveToPantry(uid: string, items: GroceryItem[], pantry: PantryItem[]) {
  const batch = writeBatch(db);
  for (const g of items) {
    const name = parseIngredient(g.name).rest || g.name;
    const nice = name.charAt(0).toUpperCase() + name.slice(1);
    const existing = pantry.find((p) => p.name.toLowerCase() === nice.toLowerCase());
    if (existing) batch.update(doc(pantryCol(uid), existing.id), { inStock: true, purchaseDate: dateKey() });
    else {
      batch.set(doc(pantryCol(uid)), {
        name: nice, quantity: g.name !== name ? g.name.slice(0, g.name.length - name.length).trim() : '',
        aisle: g.aisle, purchaseDate: dateKey(), expirationDate: null, inStock: true,
      });
    }
    batch.delete(doc(groceryItemsCol(uid), g.id));
  }
  background(batch.commit(), 'pantry');
}

// ───────────────────────── pantry

export function savePantryItem(uid: string, item: Omit<PantryItem, 'id'> & { id?: string }) {
  const { id, ...data } = item;
  const ref = id ? doc(pantryCol(uid), id) : doc(pantryCol(uid));
  background(setDoc(ref, data), 'pantry');
}

export function deletePantryItem(uid: string, id: string) {
  background(deleteDoc(doc(pantryCol(uid), id)), 'pantry');
}

// ───────────────────────── meal plan

export function addPlannedMeal(uid: string, m: Omit<PlannedMeal, 'id'>): string {
  const ref = doc(mealPlanCol(uid));
  background(setDoc(ref, { loggedEntryId: null, ...m }), 'meal plan');
  return ref.id;
}

export function updatePlannedMeal(uid: string, id: string, patch: Partial<PlannedMeal>) {
  background(updateDoc(doc(mealPlanCol(uid), id), patch as DocumentData), 'meal plan');
}

export function deletePlannedMeal(uid: string, id: string) {
  background(deleteDoc(doc(mealPlanCol(uid), id)), 'meal plan');
}

/** Log a planned recipe meal to the diary and remember that it's logged. */
export function logPlannedMeal(uid: string, m: PlannedMeal, r: Recipe): string {
  const entryId = logRecipe(uid, r, m.date, m.meal, m.servings || 1);
  updatePlannedMeal(uid, m.id, { loggedEntryId: entryId });
  return entryId;
}

// ───────────────────────── menus

export function saveMenu(uid: string, menu: Omit<RecipeMenu, 'id'> & { id?: string }): string {
  const { id, ...data } = menu;
  const ref = id ? doc(menusCol(uid), id) : doc(menusCol(uid));
  background(setDoc(ref, data), 'menu');
  return ref.id;
}

export function deleteMenu(uid: string, id: string) {
  background(deleteDoc(doc(menusCol(uid), id)), 'menu');
}

/** Copy a menu's meals into the plan, day 0 = `start`. (RecipeMan: addMenuToPlanner) */
export function addMenuToPlan(uid: string, menu: RecipeMenu, start: string, addDays: (k: string, n: number) => string) {
  const batch = writeBatch(db);
  for (const it of menu.items) {
    batch.set(doc(mealPlanCol(uid)), {
      date: addDays(start, it.day), meal: it.meal, recipeId: it.recipeId, name: it.name, servings: 1, loggedEntryId: null,
    } satisfies Omit<PlannedMeal, 'id'>);
  }
  background(batch.commit(), 'meal plan');
}

/** Fresh id helper for nested arrays. */
export const newId = () => randomId(10);
