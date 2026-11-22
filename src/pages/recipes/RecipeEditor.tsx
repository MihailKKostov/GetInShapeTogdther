import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { emptyRecipe, saveRecipe, uploadRecipePhoto } from '../../data/recipes';
import { NUTRIENT_KEYS, type Nutrients, type Recipe, type RecipePhoto, type RecipeSnapshot } from '../../data/types';
import { useAiSettings } from '../../components/PhotoTab';
import { ActionButton, ErrorLine, Icon, NumInput, Panel, Skeleton, UploadProgress, useToast } from '../../components/ui';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useSession';
import { estimateRecipeNutrition } from '../../lib/recipes/aiNutrition';
import { parseNutritionText } from '../../lib/recipes/nutritionText';
import { NUTRIENT_LABELS } from '../../lib/nutrition';
import { RecipeImage, RecipesNav, Stars } from './bits';
import { useRecipe, useRecipes } from './data';

export const DRAFT_KEY = 'wefit.recipe.draft';

type Draft = RecipeSnapshot & Partial<Pick<Recipe, 'rating' | 'favorite' | 'imagePath'>>;
type NVals = Partial<Record<keyof Nutrients, number | ''>>;

function toVals(n: Nutrients | null | undefined): NVals {
  const out: NVals = {};
  for (const k of NUTRIENT_KEYS) out[k] = n?.[k] ?? '';
  return out;
}

function fromVals(v: NVals): Nutrients | null {
  if (v.kcal === '' || v.kcal == null) return null;
  const out = { kcal: Math.round(Number(v.kcal)), protein: Number(v.protein) || 0, carbs: Number(v.carbs) || 0, fat: Number(v.fat) || 0 } as Nutrients;
  for (const k of ['fiber', 'sugar', 'satFat', 'sodiumMg'] as const) if (v[k] !== '' && v[k] != null) out[k] = Number(v[k]);
  return out;
}

export default function RecipeEditor() {
  const { id } = useParams();
  const { uid } = useMe();
  const existing = useRecipe(uid, id);
  if (id && existing.loading) return <div className="page"><RecipesNav /><Skeleton h={300} /></div>;
  if (id && !existing.data) return <div className="page"><RecipesNav /><p>Recipe not found. <Link to="/recipes">Back</Link></p></div>;
  return <EditorForm key={id ?? 'new'} id={id ?? null} initial={id ? existing.data! : null} />;
}

function readDraft(): Draft | null {
  if (!location.search.includes('draft=1')) return null;
  try { const s = sessionStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

function EditorForm({ id, initial }: { id: string | null; initial: Recipe | null }) {
  const { uid } = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const { key, model } = useAiSettings();
  const all = useRecipes(uid);
  const [r, setR] = useState<Draft>(() => ({ ...emptyRecipe(), rating: 0, favorite: false, ...(initial ?? readDraft() ?? {}) }));
  const [nvals, setNvals] = useState<NVals>(() => toVals(r.perServing));
  const [nSource, setNSource] = useState(r.perServingSource ?? null);
  const [catInput, setCatInput] = useState('');
  const [pct, setPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setR((x) => ({ ...x, [k]: v }));

  const knownCats = useMemo(() => [...new Set(all.data.flatMap((x) => x.categories ?? []))].filter((c) => !r.categories.includes(c)).sort(), [all.data, r.categories]);

  const addCat = (c: string) => {
    const v = c.trim();
    if (v && !r.categories.includes(v)) set('categories', [...r.categories, v]);
    setCatInput('');
  };

  const upload = useAction(async (files: File[]) => {
    const added: RecipePhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      setPct((i / files.length) * 100);
      added.push(await uploadRecipePhoto(uid, files[i], (p) => setPct(((i + p / 100) / files.length) * 100)));
    }
    setPct(null);
    setR((x) => {
      if (x.imageUrl) return { ...x, photos: [...x.photos, ...added] };
      const [main, ...rest] = added;
      return { ...x, imageUrl: main.url, imagePath: main.path, photos: [...x.photos, ...rest] };
    });
  });

  const makeMain = (p: RecipePhoto) => setR((x) => ({
    ...x, imageUrl: p.url, imagePath: p.path,
    photos: [...x.photos.filter((q) => q.url !== p.url), ...(x.imageUrl ? [{ url: x.imageUrl, path: x.imagePath }] : [])],
  }));

  const estimate = useAction(async () => {
    const n = await estimateRecipeNutrition(r, { key, model });
    setNvals(toVals(n)); setNSource('ai');
  });

  const fromText = () => {
    const n = parseNutritionText(r.nutrition);
    if (!n) { toast('No calories found in the nutrition text', 'bad'); return; }
    setNvals(toVals(n as Nutrients)); setNSource('recipe');
  };

  const save = useAction(async () => {
    if (!r.name.trim()) throw new Error('Give the recipe a name');
    const perServing = fromVals(nvals);
    const data: Partial<Recipe> = {
      ...r, name: r.name.trim(), perServing,
      perServingSource: perServing ? (nSource ?? 'manual') : null,
      ingredients: r.ingredients.split('\n').map((l) => l.trim()).filter(Boolean).join('\n'),
      directions: r.directions.split('\n').map((l) => l.trim()).filter(Boolean).join('\n'),
    };
    const newId = saveRecipe(uid, id, data);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    toast(id ? 'Recipe saved' : 'Recipe added to your recipes');
    nav(`/recipes/${newId}`, { replace: true });
  });

  useEffect(() => () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }, []);

  const text = (k: keyof Draft, label: string, ph = '') => (
    <label className="f"><span>{label}</span><input value={String(r[k] ?? '')} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} /></label>
  );

  return (
    <div className="page">
      <RecipesNav />
      <h1>{id ? 'Edit recipe' : r.sourceUrl ? 'Review imported recipe' : 'New recipe'}</h1>
      <Panel title="Basics">
        <div className="col gap2">
          <label className="f"><span>Name *</span><input value={r.name} onChange={(e) => set('name', e.target.value)} autoFocus={!id} /></label>
          <label className="f"><span>Description</span><textarea rows={2} value={r.description} onChange={(e) => set('description', e.target.value)} /></label>
          <div className="fgrid">
            {text('servings', 'Servings / yield', 'e.g. 4 servings')}
            {text('difficulty', 'Difficulty', 'e.g. Easy')}
          </div>
          <div className="fgrid">
            {text('prepTime', 'Prep time', '15 mins')}
            {text('cookTime', 'Cook time', '30 mins')}
            {text('totalTime', 'Total time', '45 mins')}
          </div>
          <div className="row between">
            <span className="flabel">Rating</span>
            <Stars value={r.rating ?? 0} onChange={(v) => set('rating', v)} size={22} />
          </div>
          <div className="col" style={{ gap: 6 }}>
            <span className="flabel">Categories</span>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {r.categories.map((c) => <button key={c} type="button" className="chip on" onClick={() => set('categories', r.categories.filter((x) => x !== c))}>{c} ✕</button>)}
              {knownCats.map((c) => <button key={c} type="button" className="chip" onClick={() => addCat(c)}>+ {c}</button>)}
            </div>
            <div className="row">
              <input placeholder="New category" value={catInput} onChange={(e) => setCatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(catInput); } }} />
              <button type="button" className="btn" onClick={() => addCat(catInput)} disabled={!catInput.trim()}>Add</button>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Photos">
        <div className="col">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) upload.run(f); e.target.value = ''; }} />
          {(r.imageUrl || r.photos.length > 0) && (
            <div className="pgrid">
              {r.imageUrl && (
                <div style={{ position: 'relative' }}>
                  <RecipeImage r={r} style={{ aspectRatio: '1', borderRadius: 8 }} />
                  <span className="pill accent" style={{ position: 'absolute', left: 4, top: 4 }}>Main</span>
                  <button type="button" className="btn sm" style={{ position: 'absolute', right: 4, bottom: 4 }} onClick={() => setR((x) => ({ ...x, imageUrl: '', imagePath: undefined }))}>Remove</button>
                </div>
              )}
              {r.photos.map((p) => (
                <div key={p.url} style={{ position: 'relative' }}>
                  <img src={p.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} referrerPolicy="no-referrer" />
                  <div className="row" style={{ position: 'absolute', left: 4, right: 4, bottom: 4, gap: 4 }}>
                    <button type="button" className="btn sm grow" onClick={() => makeMain(p)}>Main</button>
                    <button type="button" className="btn sm" onClick={() => set('photos', r.photos.filter((q) => q.url !== p.url))} aria-label="Remove photo">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ActionButton state={upload.state} pendingLabel="Uploading…" onClick={() => fileRef.current?.click()}><Icon name="camera" size={18} /> Add photos</ActionButton>
          {pct != null && <UploadProgress pct={pct} />}
          <ErrorLine>{upload.error}</ErrorLine>
        </div>
      </Panel>

      <Panel title="Ingredients">
        <textarea rows={8} value={r.ingredients} onChange={(e) => set('ingredients', e.target.value)}
          placeholder={'One per line, e.g.\n2 cups flour\n1 tsp salt\n\nFor the sauce:\n1 can tomatoes'} />
        <p className="small muted" style={{ margin: '6px 0 0' }}>Lines ending with ":" become section headings.</p>
      </Panel>

      <Panel title="Directions">
        <textarea rows={8} value={r.directions} onChange={(e) => set('directions', e.target.value)} placeholder={'One step per line. Times like "bake 25 minutes" become timers.'} />
      </Panel>

      <Panel title="Nutrition per serving" right={nSource === 'ai' ? <span className="pill">AI estimate</span> : undefined}>
        <div className="col">
          <p className="small muted" style={{ margin: 0 }}>Needed to log this recipe to your food diary.</p>
          <div className="row wrap">
            {r.nutrition && <button type="button" className="btn sm" onClick={fromText}>Read from nutrition text</button>}
            {key
              ? <ActionButton size="sm" variant="soft" state={estimate.state} pendingLabel="Estimating…" onClick={() => estimate.run()} disabled={!r.ingredients.trim()}>✨ Estimate with AI</ActionButton>
              : <Link className="btn sm" to="/settings#ai">Set up AI estimates</Link>}
          </div>
          <ErrorLine>{estimate.error}</ErrorLine>
          <div className="fgrid">
            {NUTRIENT_KEYS.map((k) => (
              <label key={k} className="f"><span>{NUTRIENT_LABELS[k].label}{k === 'kcal' ? ' *' : ''}</span>
                <NumInput value={nvals[k] ?? ''} onChange={(v) => { setNvals((s) => ({ ...s, [k]: v })); setNSource('manual'); }} unit={NUTRIENT_LABELS[k].unit} />
              </label>
            ))}
          </div>
          <label className="f"><span>Nutrition text (as published)</span><textarea rows={3} value={r.nutrition} onChange={(e) => set('nutrition', e.target.value)} placeholder="Calories: 350&#10;Protein: 20 g" /></label>
        </div>
      </Panel>

      <Panel title="Notes & source">
        <div className="col">
          <label className="f"><span>Notes</span><textarea rows={3} value={r.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          <div className="fgrid">
            {text('source', 'Source', 'e.g. Grandma, Budget Bytes')}
            {text('sourceUrl', 'Source link', 'https://…')}
          </div>
        </div>
      </Panel>

      <ErrorLine>{save.error}</ErrorLine>
      <div className="row">
        <button className="btn" onClick={() => nav(-1)}>Cancel</button>
        <span className="grow" />
        <ActionButton variant="primary" size="lg" state={save.state} pendingLabel="Saving…" onClick={() => save.run()} disabled={upload.state === 'pending'}>Save recipe</ActionButton>
      </div>
    </div>
  );
}
