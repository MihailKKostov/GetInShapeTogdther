// Turning OpenAI's structured answer into a recipe draft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDraft } from '../src/lib/recipes/aiRecipe.ts';

const base = {
  kind: 'dish' as const, name: ' Chicken stir-fry ', description: 'Quick and spicy.', servings: 2,
  ingredients: ['300 g chicken breast', ' 1 tbsp soy sauce ', '', 'Sauce:', '1 tsp chilli'],
  directions: ['Slice the chicken.', 'Stir-fry 8 minutes.'], prepMinutes: 10, cookMinutes: 75,
  perServing: { kcal: 512.4, protein: 41.26, carbs: 30, fat: 18.04, fiber: 3, sugar: 6, satFat: 3.2, sodiumMg: 880.6 },
  categories: ['Dinner', 'Dinner', ' Asian ', 'Quick', 'Chicken'], note: 'Assumed 1 tbsp oil.',
};

test('dish photo → editable draft with AI nutrition', () => {
  const { kind, recipe: r, note } = toDraft(base);
  assert.equal(kind, 'dish');
  assert.equal(r.name, 'Chicken stir-fry');
  assert.equal(r.ingredients, '300 g chicken breast\n1 tbsp soy sauce\nSauce:\n1 tsp chilli');
  assert.equal(r.directions, 'Slice the chicken.\nStir-fry 8 minutes.');
  assert.equal(r.servings, '2 servings');
  assert.equal(r.prepTime, '10 mins');
  assert.equal(r.cookTime, '1 hr 15 mins');
  assert.equal(r.totalTime, '1 hr 25 mins');
  assert.deepEqual(r.perServing, { kcal: 512, protein: 41.3, carbs: 30, fat: 18, fiber: 3, sugar: 6, satFat: 3.2, sodiumMg: 881 });
  assert.equal(r.perServingSource, 'ai');
  assert.deepEqual(r.categories, ['Dinner', 'Asian', 'Quick']);
  assert.equal(note, 'Assumed 1 tbsp oil.');
});

test('unknown times and servings stay blank; no food means no nutrition', () => {
  const r = toDraft({ ...base, servings: 0, prepMinutes: 0, cookMinutes: 20 }).recipe;
  assert.equal(r.servings, '');
  assert.equal(r.prepTime, '');
  assert.equal(r.totalTime, '');
  assert.equal(toDraft({ ...base, servings: 1 }).recipe.servings, '1 serving');
  const none = toDraft({ ...base, kind: 'not_food', ingredients: [], directions: [] });
  assert.equal(none.recipe.perServing, null);
  assert.equal(none.recipe.perServingSource, null);
});
