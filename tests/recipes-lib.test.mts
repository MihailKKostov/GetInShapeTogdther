// Ported RecipeMan parser tests (IngredientsTest.kt) plus WeFit additions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineIngredients, ingredientKey, parseIngredient, servingsNumber, transformIngredient } from '../src/lib/recipes/ingredients.ts';
import { findTimers, humanizeDuration, formatSeconds } from '../src/lib/recipes/durations.ts';
import { guessAisle } from '../src/lib/recipes/aisles.ts';
import { parseNutritionText, nutritionToText } from '../src/lib/recipes/nutritionText.ts';

test('parses quantities', () => {
  const p = parseIngredient('1 1/2 cups all-purpose flour, sifted');
  assert.equal(p.quantity, 1.5); assert.equal(p.unit, 'cup'); assert.equal(p.rest, 'all-purpose flour, sifted');
  assert.equal(ingredientKey('1 1/2 cups all-purpose flour, sifted'), 'all-purpose flour');
  const u = parseIngredient('1½ tsp salt');
  assert.equal(u.quantity, 1.5); assert.equal(u.unit, 'tsp');
  const range = parseIngredient('2-3 cloves garlic');
  assert.equal(range.quantity, 2); assert.equal(range.quantityEnd, 3); assert.equal(range.unit, 'clove');
  assert.equal(parseIngredient('1 (14 oz) can diced tomatoes').unit, 'can');
  assert.equal(parseIngredient('2 T butter').unit, 'tbsp');
  assert.equal(parseIngredient('2 t butter').unit, 'tsp');
  assert.equal(parseIngredient('Salt and pepper to taste').quantity, null);
  assert.equal(parseIngredient('2 eggs').unit, null);
});

test('scales', () => {
  assert.equal(transformIngredient('1 1/2 cups flour', 2), '3 cups flour');
  assert.equal(transformIngredient('1 1/2 cups flour', 0.5), '¾ cup flour');
  assert.equal(transformIngredient('2-3 cloves garlic', 2), '4–6 cloves garlic');
  assert.equal(transformIngredient('2 egg', 0.5), '1 egg');
  assert.equal(transformIngredient('Salt to taste', 3), 'Salt to taste');
  assert.equal(transformIngredient('Dough:', 3), 'Dough:');
});

test('converts units', () => {
  assert.equal(transformIngredient('2 cups milk', 1, 'metric'), '475 ml milk');
  assert.equal(transformIngredient('1 lb butter', 1, 'metric').replace('455', '454'), '454 g butter');
  assert.equal(transformIngredient('1 tbsp oil', 1, 'metric'), '1 tbsp oil');
  assert.equal(transformIngredient('240 ml water', 1, 'us'), '1 cup water');
});

test('combines grocery lines', () => {
  assert.equal(combineIngredients('1 cup flour', '2 cups flour'), '3 cups flour');
  assert.equal(combineIngredients('1 cup flour', '2 tbsp flour'), null);
  assert.equal(combineIngredients('1 cup flour', '2 cups sugar'), null);
});

test('guesses aisles', () => {
  assert.equal(guessAisle('yellow onions'), 'Produce');
  assert.equal(guessAisle('chicken broth'), 'Canned & Jarred');
  assert.equal(guessAisle('chicken thighs'), 'Meat & Seafood');
  assert.equal(guessAisle('garlic powder'), 'Spices & Seasonings');
  assert.equal(guessAisle('peanut butter'), 'Condiments & Sauces');
  assert.equal(guessAisle('unsalted butter'), 'Dairy & Eggs');
  assert.equal(guessAisle('all-purpose flour'), 'Baking');
  assert.equal(guessAisle('fresh strawberries'), 'Produce');
});

test('timers and durations', () => {
  const t = findTimers('Bake for 25-30 minutes, then rest 1 hour. Simmer for an hour and a half.');
  assert.deepEqual(t.map((x) => x.seconds), [1500, 3600, 5400]);
  assert.equal(humanizeDuration('PT90M'), '1 hr 30 mins');
  assert.equal(humanizeDuration('PT0S'), '');
  assert.equal(humanizeDuration('25 minutes'), '25 minutes');
  assert.equal(formatSeconds(5400), '1:30:00');
});

test('servings and nutrition text', () => {
  assert.equal(servingsNumber('Makes 24 cookies'), 24);
  assert.equal(servingsNumber('Serves 4–6'), 4);
  assert.equal(servingsNumber(''), null);
  const n = parseNutritionText('Calories: 421 kcal\nFat: 13 g\nSaturated fat: 3 g\nSodium: 688 mg\nCarbohydrates: 42 g\nFiber: 2 g\nProtein: 31 g');
  assert.deepEqual(n, { kcal: 421, protein: 31, carbs: 42, satFat: 3, fat: 13, fiber: 2, sodiumMg: 688 });
  assert.equal(parseNutritionText('Calories 350 kcal, Fat 12g, Carbs 40g, Protein 18g')?.carbs, 40);
  assert.equal(parseNutritionText('Energy: 2092 kJ')?.kcal, 500);
  assert.equal(parseNutritionText('Protein: 12 g'), null);
  assert.equal(parseNutritionText(nutritionToText({ kcal: 300, protein: 20, fat: 9 }))?.protein, 20);
});
