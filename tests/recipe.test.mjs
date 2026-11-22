// Unit tests for the recipe extractor used by the importRecipe Cloud Function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRecipe, parseNutrition, firstNumber } from '../functions/recipe.js';

const page = (json) => `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;

test('finds a Recipe inside @graph with nutrition, yield and ingredients', () => {
  const r = extractRecipe(page({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: 'Blog' },
      {
        '@type': 'Recipe',
        name: 'Chicken &amp; Rice Bowl',
        recipeYield: ['4', '4 servings'],
        image: [{ url: 'https://example.com/a.jpg' }],
        recipeIngredient: ['2 cups rice', '500 g chicken breast', '1&frac12; tbsp oil'],
        nutrition: { '@type': 'NutritionInformation', calories: '520 kcal', proteinContent: '38 g', carbohydrateContent: '55,5 g', fatContent: '14 g', sodiumContent: '620 mg', servingSize: '1 bowl' },
      },
    ],
  }), 'https://example.com/r');
  assert.equal(r.name, 'Chicken & Rice Bowl');
  assert.equal(r.servings, 4);
  assert.equal(r.image, 'https://example.com/a.jpg');
  assert.deepEqual(r.ingredients, ['2 cups rice', '500 g chicken breast', '1½ tbsp oil']);
  assert.equal(r.nutrition.kcal, 520);
  assert.equal(r.nutrition.protein, 38);
  assert.equal(r.nutrition.carbs, 55.5);
  assert.equal(r.nutrition.sodiumMg, 620);
  assert.equal(r.nutrition.servingSize, '1 bowl');
});

test('handles @type arrays, missing nutrition and text yields', () => {
  const r = extractRecipe(page([{ '@type': ['Recipe', 'NewsArticle'], name: 'Soup', recipeYield: 'Serves 6' }]), 'u');
  assert.equal(r.servings, 6);
  assert.equal(r.nutrition, null);
  assert.deepEqual(r.ingredients, []);
});

test('returns null when the page has no recipe', () => {
  assert.equal(extractRecipe(page({ '@type': 'Article', name: 'Not food' }), 'u'), null);
  assert.equal(extractRecipe('<html>no json-ld</html>', 'u'), null);
});

test('skips broken JSON-LD blocks and keeps looking', () => {
  const html = `<script type="application/ld+json">{broken</script>${page({ '@type': 'Recipe', name: 'Ok' })}`;
  assert.equal(extractRecipe(html, 'u').name, 'Ok');
});

test('nutrition units: kJ, sodium in grams, plain numbers', () => {
  assert.equal(parseNutrition({ calories: '2092 kJ' }).kcal, 500);
  assert.equal(parseNutrition({ calories: '450 calories', sodiumContent: '1.2 g' }).sodiumMg, 1200);
  assert.equal(parseNutrition({ calories: 300 }).kcal, 300);
  assert.equal(parseNutrition({}), null);
  assert.equal(firstNumber('12,5 g'), 12.5);
});
