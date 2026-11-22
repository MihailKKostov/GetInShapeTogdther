// Paprika import tests, mirroring RecipeMan's PaprikaFormatTest with exports built like Paprika's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, deflateRawSync, crc32 } from 'node:zlib';
import { readPaprikaExport } from '../src/lib/recipes/paprika.ts';

const jpeg = (seed: number, size = 400) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from(Array.from({ length: size }, (_, i) => (i * 31 + seed) & 0xff))]);
const b64 = (b: Buffer) => b.toString('base64');

const muffins = {
  uid: 'M1', created: '2026-08-10 20:45:38', name: 'Test Muffins', description: '',
  ingredients: '1/4 cup oil\n1/2 cup maple syrup\n2 large eggs\n1 3/4 cups spelt flour\nOptional nuts',
  directions: 'Preheat oven to 165°C.\n\nThe mix\n- Whisk oil and eggs\n- Add flour\n\nBake for 22 minutes.\n',
  notes: '', nutritional_info: '', servings: '', rating: 5, source: '', source_url: '', photo_large: 'LARGE.jpg', image_url: null,
  categories: ['Desserts'], photo_data: b64(jpeg(1, 150)),
  photos: [{ filename: 'LARGE.jpg', data: b64(jpeg(2, 900)) }, { filename: 'OTHER.jpg', data: b64(jpeg(3, 800)) }],
};
const bowl = {
  uid: 'B1', created: '2025-01-05 11:47:36', name: 'Test Bowl', description: 'A test bowl.',
  ingredients: 'For the Base:\n\n- 200 g quinoa (uncooked)\n\n- 500 ml water\n\n\nDressing:\n\n- 60 g (4 tbsp) tahini\n',
  directions: 'Prepare the Quinoa:\n\n1. Rinse quinoa.\n\n\n2. Simmer for 15 minutes.\n\n\n\nMake the Dressing:\n\n1. Whisk everything.',
  notes: 'Keeps 3 days.', nutritional_info: '537 Kcal\n38g Protein\n', prep_time: '15 min', cook_time: '35 min', total_time: '50 min',
  difficulty: 'Easy', servings: '4', rating: 0, categories: ['Batch', 'Dinner'], photos: [],
};

/** A .paprikarecipes zip (deflated entries of gzipped JSON), like Paprika writes. */
function zip(files: [string, Buffer][]): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name); const comp = deflateRawSync(data); const crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp); centrals.push(ch, nameBuf); offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

test('reads a .paprikarecipes export with photos, sections, nutrition and dates', async () => {
  const file = new Blob([zip([['Test Muffins.paprikarecipe', gzipSync(JSON.stringify(muffins))], ['Test Bowl.paprikarecipe', gzipSync(JSON.stringify(bowl))], ['__MACOSX/._x', Buffer.from('junk')]])]);
  const [m, b] = await readPaprikaExport(file);
  assert.equal(m.recipe.name, 'Test Muffins');
  assert.equal(m.rating, 5);
  assert.deepEqual(m.recipe.categories, ['Desserts']);
  assert.equal(m.mainPhoto?.size, 903);      // photo_large entry, not the small photo_data
  assert.equal(m.extraPhotos.length, 1);
  assert.equal(m.extraPhotos[0].size, 803);
  assert.equal(m.created, new Date(2026, 7, 10, 20, 45, 38).getTime());
  assert.equal(b.recipe.ingredients, 'For the Base:\n200 g quinoa (uncooked)\n500 ml water\nDressing:\n60 g (4 tbsp) tahini');
  assert.equal(b.recipe.directions.split('\n')[0], 'Prepare the Quinoa:');
  assert.equal(b.recipe.notes, 'Keeps 3 days.');
  assert.equal(b.recipe.perServing?.kcal, 537);
  assert.equal(b.recipe.perServing?.protein, 38);
  assert.equal(b.recipe.servings, '4');
  assert.equal(b.mainPhoto, null);
});

test('reads a single gzipped .paprikarecipe and rejects other files', async () => {
  const [r] = await readPaprikaExport(new Blob([gzipSync(JSON.stringify(bowl))]));
  assert.equal(r.recipe.name, 'Test Bowl');
  await assert.rejects(readPaprikaExport(new Blob([Buffer.from('hello')])), /isn't a Paprika export/);
});
