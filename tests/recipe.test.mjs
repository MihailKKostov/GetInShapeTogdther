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

test('directions with sections, ISO times, categories and nutrition text (RecipeMan parity)', () => {
  const r = extractRecipe(page({
    '@type': 'Recipe', name: 'Pie', recipeYield: '8 slices', prepTime: 'PT20M', cookTime: 'PT1H15M',
    recipeCategory: 'Dessert', recipeCuisine: ['American', 'Dessert'],
    publisher: { '@type': 'Organization', name: 'Pie Blog' },
    recipeIngredient: ['2 cups flour'],
    recipeInstructions: [
      { '@type': 'HowToSection', name: 'Crust', itemListElement: [{ '@type': 'HowToStep', text: 'Step 1: Mix flour.' }, { '@type': 'HowToStep', text: 'Chill 30 minutes.' }] },
      { '@type': 'HowToStep', text: '<p>Bake for 45 minutes.</p>' },
    ],
    nutrition: { calories: '350 kcal', proteinContent: '5 g' },
  }), 'https://pie.example/r');
  assert.deepEqual(r.directions, ['Crust:', 'Mix flour.', 'Chill 30 minutes.', 'Bake for 45 minutes.']);
  assert.equal(r.prepTime, '20 mins');
  assert.equal(r.cookTime, '1 hr 15 mins');
  assert.deepEqual(r.categories, ['Dessert', 'American']);
  assert.equal(r.source, 'Pie Blog');
  assert.equal(r.yieldLabel, '8 slices');
  assert.equal(r.nutritionText, 'Calories: 350 kcal\nProtein: 5 g');
});

test('falls back to microdata', () => {
  const html = `<html><body><div itemscope itemtype="http://schema.org/Recipe">
    <h1 itemprop="name">Pancakes</h1><img itemprop="image" src="/p.jpg">
    <span itemprop="recipeYield">4</span><time itemprop="cookTime" datetime="PT15M">15 min</time>
    <ul><li itemprop="recipeIngredient">1 cup flour</li><li itemprop="recipeIngredient">1 egg</li></ul>
    <div itemprop="recipeInstructions"><ol><li>Whisk.</li><li>Fry.</li></ol></div></div></body></html>`;
  const r = extractRecipe(html, 'https://cakes.example/pancakes');
  assert.equal(r.name, 'Pancakes');
  assert.deepEqual(r.ingredients, ['1 cup flour', '1 egg']);
  assert.deepEqual(r.directions, ['Whisk.', 'Fry.']);
  assert.equal(r.cookTime, '15 mins');
  assert.equal(r.image, 'https://cakes.example/p.jpg');
  assert.equal(r.servings, 4);
  assert.equal(r.source, 'cakes.example');
});

test('falls back to page heuristics', () => {
  const html = `<html><head><meta property="og:title" content="Gran's Stew"></head><body><h1>Gran's Stew</h1>
    <div class="recipe-ingredients"><ul><li>500 g beef</li><li>2 carrots</li><li>1 onion</li></ul></div>
    <div class="instructions"><p>Brown the beef.</p><p>Simmer 2 hours.</p></div></body></html>`;
  const r = extractRecipe(html, 'https://blog.example/stew');
  assert.equal(r.name, "Gran's Stew");
  assert.deepEqual(r.ingredients, ['500 g beef', '2 carrots', '1 onion']);
  assert.deepEqual(r.directions, ['Brown the beef.', 'Simmer 2 hours.']);
});
