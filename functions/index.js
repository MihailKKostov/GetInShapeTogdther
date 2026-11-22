// Cloud Functions for WeFit.
//
// importRecipe: the app writes users/{uid}/recipeImports/{id} = { url, status: 'pending' }.
// This function reads that page, extracts the recipe and writes the result back to the same
// document, which the app is listening to. Using a Firestore trigger (instead of an HTTP endpoint)
// means nothing needs to be publicly invokable, which organisation policies often forbid.
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { extractRecipe } from './recipe.js';
import { fetchPage, UserError } from './fetchPage.js';

initializeApp();

// Must match the Firestore database's location; the deploy workflow writes LOCATION to functions/.env.
setGlobalOptions({ region: process.env.LOCATION || 'us-central1', maxInstances: 5, memory: '256MiB', timeoutSeconds: 30 });

export const importRecipe = onDocumentCreated('users/{uid}/recipeImports/{importId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const { url, status } = snap.data();
  if (status !== 'pending' || typeof url !== 'string') return;
  try {
    const { html, finalUrl } = await fetchPage(url);
    const recipe = extractRecipe(html, finalUrl);
    if (!recipe) throw new UserError('Couldn\'t find a recipe on that page. Try the recipe\'s own page rather than a list or search page.');
    await snap.ref.update({ status: 'done', recipe: JSON.parse(JSON.stringify(recipe)), finishedAt: FieldValue.serverTimestamp() });
  } catch (e) {
    console.warn('recipe import failed', url, e);
    await snap.ref.update({
      status: 'error',
      error: e instanceof UserError ? e.message : 'Something went wrong reading that page',
      finishedAt: FieldValue.serverTimestamp(),
    });
  }
});
