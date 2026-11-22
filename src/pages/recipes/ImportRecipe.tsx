import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, Timestamp } from 'firebase/firestore';
import { recipeImportsCol, requestRecipeImport } from '../../data/api';
import { emptyRecipe, saveRecipe, uploadRecipePhoto } from '../../data/recipes';
import type { RecipeImport, RecipeSnapshot } from '../../data/types';
import { ErrorLine, Icon, Panel, Seg, Spinner, UploadProgress, useToast } from '../../components/ui';
import { useDoc } from '../../hooks/useFirestore';
import { useMe } from '../../hooks/useSession';
import { nutritionToText } from '../../lib/recipes/nutritionText';
import { readPaprikaExport, type PaprikaRecipe } from '../../lib/recipes/paprika';
import { RecipesNav } from './bits';
import { useRecipes } from './data';
import { DRAFT_AI_NOTE_KEY, DRAFT_KEY } from './RecipeEditor';
import { useAiSettings } from '../../components/PhotoTab';
import { useObjectUrls } from '../../hooks/useObjectUrls';
import { blobToDataUrl, resizeImage } from '../../lib/images';
import { recipeFromPhotos } from '../../lib/recipes/aiRecipe';

/** Pull a URL out of shared text ("Look at this https://…"). */
function findUrl(...vals: (string | null)[]): string {
  for (const v of vals) {
    const m = v?.match(/https?:\/\/\S+/);
    if (m) return m[0].replace(/[),.]+$/, '');
  }
  return '';
}

type Mode = 'photo' | 'link' | 'paprika';

export default function ImportRecipe() {
  const [params] = useSearchParams();
  const shared = findUrl(params.get('url'), params.get('text'), params.get('title'));
  const [mode, setMode] = useState<Mode>(() => (params.get('mode') === 'photo' ? 'photo' : params.get('mode') === 'paprika' ? 'paprika' : 'link'));
  return (
    <div className="page">
      <RecipesNav />
      <h1>Add recipes</h1>
      <Seg block value={mode} onChange={setMode} options={[{ v: 'photo', l: '📷 Photo' }, { v: 'link', l: '🔗 Link' }, { v: 'paprika', l: '🌶 Paprika' }]} />
      {mode === 'photo' ? <PhotoRecipe /> : mode === 'link' ? <LinkImport initialUrl={shared} /> : <PaprikaImport />}
    </div>
  );
}

function LinkImport({ initialUrl }: { initialUrl: string }) {
  const { uid } = useMe();
  const nav = useNavigate();
  const recipes = useRecipes(uid);
  const [url, setUrl] = useState(initialUrl);
  const [jobId, setJobId] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const job = useDoc<RecipeImport>(jobId ? doc(recipeImportsCol(uid), jobId) : null, `ri:${jobId}`);
  const status = job.data?.status ?? (jobId ? 'pending' : null);
  const started = useRef(false);

  const start = (u = url) => {
    let v = u.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
    setUrl(v);
    setSlow(false);
    setJobId(requestRecipeImport(uid, v));
  };
  // Shared from another app: start right away.
  useEffect(() => { if (initialUrl && !started.current) { started.current = true; start(initialUrl); } }, [initialUrl]);
  useEffect(() => {
    if (status !== 'pending') return;
    const t = setTimeout(() => setSlow(true), 25000);
    return () => clearTimeout(t);
  }, [status, jobId]);

  const openDraft = (d: RecipeSnapshot) => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
    nav('/recipes/new?draft=1');
  };

  useEffect(() => {
    if (status !== 'done' || !job.data?.recipe) return;
    const x = job.data.recipe;
    const n = x.nutrition;
    openDraft({
      ...emptyRecipe(),
      name: x.name, description: x.description ?? '', ingredients: x.ingredients.join('\n'), directions: (x.directions ?? []).join('\n'),
      nutrition: x.nutritionText || (n ? nutritionToText(n) : ''),
      perServing: n?.kcal != null ? { kcal: n.kcal, protein: n.protein ?? 0, carbs: n.carbs ?? 0, fat: n.fat ?? 0, fiber: n.fiber, sugar: n.sugar, satFat: n.satFat, sodiumMg: n.sodiumMg } : null,
      perServingSource: n?.kcal != null ? 'recipe' : null,
      servings: x.yieldLabel ?? (x.servings ? String(x.servings) : ''),
      prepTime: x.prepTime ?? '', cookTime: x.cookTime ?? '', totalTime: x.totalTime ?? '',
      source: x.source ?? '', sourceUrl: x.url, imageUrl: x.image ?? '', categories: x.categories ?? [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const duplicate = url && recipes.data.find((r) => r.sourceUrl && r.sourceUrl.replace(/\/$/, '') === url.trim().replace(/\/$/, ''));
  return (
    <Panel title="From a link">
      <div className="col">
        <p className="small muted" style={{ margin: 0 }}>
          Paste the link to any recipe page. We read the recipe data most sites publish (name, photo, ingredients, steps, times,
          servings, nutrition) and you review it before saving. On Android, once WeFit is on your home screen you can also use
          <b> Share → WeFit</b> from your browser.
        </p>
        <div className="row">
          <input type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} disabled={status === 'pending'} />
          <button className="btn primary" onClick={() => start()} disabled={!url.trim() || status === 'pending'}>{status === 'pending' ? <><Spinner /> Reading…</> : 'Import'}</button>
        </div>
        {duplicate && <div className="small">You already have this recipe: <Link to={`/recipes/${duplicate.id}`}>{duplicate.name}</Link></div>}
        {status === 'pending' && <div className="small muted row"><Spinner /> {slow ? 'Still working… If this never finishes, recipe import may not be set up yet.' : 'Reading the recipe page…'}</div>}
        {status === 'error' && <ErrorLine>{job.data?.error ?? 'Could not import that recipe'}</ErrorLine>}
        {(status === 'error' || slow) && (
          <button className="btn soft" onClick={() => openDraft({ ...emptyRecipe(), sourceUrl: url.trim() })}>Type the recipe in yourself</button>
        )}
      </div>
    </Panel>
  );
}

function PaprikaImport() {
  const { uid } = useMe();
  const toast = useToast();
  const nav = useNavigate();
  const recipes = useRecipes(uid);
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PaprikaRecipe[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; pct: number } | null>(null);

  const existing = useMemo(() => new Set(recipes.data.map((r) => `${r.name.toLowerCase()}|${r.sourceUrl}`)), [recipes.data]);
  const isDup = (p: PaprikaRecipe) => existing.has(`${p.recipe.name.toLowerCase()}|${p.recipe.sourceUrl}`);

  const read = async (f: File) => {
    setErr(null); setItems(null); setReading(true);
    try {
      const list = await readPaprikaExport(f);
      setItems(list);
      // Like RecipeMan: recipes already in your library are skipped.
      setSelected(new Set(list.map((_, i) => i).filter((i) => !isDup(list[i]))));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read that file');
    } finally { setReading(false); }
  };

  const run = async () => {
    if (!items) return;
    const chosen = items.filter((_, i) => selected.has(i));
    for (let i = 0; i < chosen.length; i++) {
      const p = chosen[i];
      setProgress({ done: i, total: chosen.length, pct: (i / chosen.length) * 100 });
      const snap: RecipeSnapshot = { ...p.recipe, photos: [] };
      let imagePath: string | undefined;
      try {
        if (p.mainPhoto) { const ph = await uploadRecipePhoto(uid, p.mainPhoto); snap.imageUrl = ph.url; imagePath = ph.path; }
        for (const x of p.extraPhotos) snap.photos.push(await uploadRecipePhoto(uid, x));
      } catch (e) { console.warn('photo upload failed', e); }
      saveRecipe(uid, null, { ...snap, imagePath, rating: p.rating, favorite: false, ...(p.created ? { createdAt: Timestamp.fromMillis(p.created) } : {}) });
    }
    setProgress(null);
    toast(`Imported ${chosen.length} recipe${chosen.length === 1 ? '' : 's'} from Paprika`);
    nav('/recipes');
  };

  return (
    <Panel title="From Paprika">
      <div className="col">
        <p className="small muted" style={{ margin: 0 }}>
          In Paprika, select your recipes and use <b>Export</b> with the <b>.paprikarecipes</b> format, then choose that file here.
          Ratings, categories, times, notes, nutrition, created dates and all photos come across. Recipes already in your library are skipped.
        </p>
        <input ref={fileRef} type="file" accept=".paprikarecipes,.paprikarecipe,application/zip,application/gzip,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={reading || !!progress}>
          {reading ? <><Spinner /> Reading file…</> : <><Icon name="upload" size={18} /> Choose Paprika export</>}
        </button>
        <ErrorLine>{err}</ErrorLine>
        {items && (
          <>
            <div className="row between">
              <span className="small"><b>{items.length}</b> recipes in file · <b>{selected.size}</b> selected</span>
              <span className="row" style={{ gap: 4 }}>
                <button className="btn ghost sm" onClick={() => setSelected(new Set(items.map((_, i) => i)))}>All</button>
                <button className="btn ghost sm" onClick={() => setSelected(new Set())}>None</button>
              </span>
            </div>
            <div className="panel list" style={{ maxHeight: 360, overflowY: 'auto' }}>
              {items.map((p, i) => (
                <label key={i} className="li" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                  <div className="main">
                    <div className="name">{p.recipe.name}</div>
                    <div className="sub">{[p.recipe.categories.join(', '), p.mainPhoto ? `${1 + p.extraPhotos.length} photo${p.extraPhotos.length ? 's' : ''}` : '', isDup(p) ? 'already in your recipes' : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                </label>
              ))}
            </div>
            {progress ? <UploadProgress pct={progress.pct} label={`Importing ${progress.done + 1} of ${progress.total}`} /> : (
              <button className="btn primary" onClick={run} disabled={!selected.size}>Import {selected.size} recipe{selected.size === 1 ? '' : 's'}</button>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

const MAX_PHOTOS = 4;

/** Photo of a dish or of a written recipe → AI recipe draft → editor to review and tweak. */
function PhotoRecipe() {
  const { uid } = useMe();
  const nav = useNavigate();
  const { key, model } = useAiSettings();
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [hint, setHint] = useState('');
  const [stage, setStage] = useState<'reading' | 'saving' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Fixed-length argument: the hook uses it as effect dependencies.
  const previews = useObjectUrls(Array.from({ length: MAX_PHOTOS }, (_, i) => files[i])).slice(0, files.length);
  useEffect(() => () => abort.current?.abort(), []);

  if (!key) {
    return (
      <Panel title="From a photo">
        <div className="col">
          <p className="small muted" style={{ margin: 0 }}>
            Take a photo of a dish, or of a recipe in a cookbook or on a card, and AI drafts the whole recipe: ingredients with
            amounts, steps, times and nutrition per serving, ready for you to adjust. This uses your own OpenAI API key, which you add once in Settings.
          </p>
          <Link className="btn primary" to="/settings#ai">Add OpenAI key in Settings</Link>
        </div>
      </Panel>
    );
  }

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (!picked.length) return;
    setErr(null);
    setFiles((cur) => [...cur, ...picked].slice(0, MAX_PHOTOS));
  };

  const run = async () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setErr(null); setStage('reading');
    try {
      const images = await Promise.all(files.map(async (f) => blobToDataUrl((await resizeImage(f, 1280, 'image/jpeg', 0.85)).blob)));
      const res = await recipeFromPhotos(images, { key, model, hint, signal: ctl.signal });
      if (res.kind === 'not_food' || !res.recipe.ingredients) throw new Error(res.note || 'No dish or recipe found in that photo. Try another one.');
      const draft = res.recipe;
      // A photo of the dish becomes the recipe photo; photos of a cookbook page aren't kept.
      if (res.kind === 'dish') {
        setStage('saving');
        try { const ph = await uploadRecipePhoto(uid, files[0]); draft.imageUrl = ph.url; Object.assign(draft, { imagePath: ph.path }); }
        catch (e) { console.warn('photo upload failed', e); }
      } else {
        draft.notes = 'Transcribed from a photo.';
      }
      if (ctl.signal.aborted) return;
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        sessionStorage.setItem(DRAFT_AI_NOTE_KEY, res.note);
      } catch { /* ignore */ }
      nav('/recipes/new?draft=1');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setErr(e instanceof Error ? e.message : 'Something went wrong');
      setStage(null);
    }
  };

  return (
    <Panel title="From a photo">
      <div className="col">
        <p className="small muted" style={{ margin: 0 }}>
          Photograph a <b>dish</b> and AI writes a recipe that would make it, or photograph a <b>recipe</b> (cookbook page, card,
          screenshot; up to {MAX_PHOTOS} pages) and it's typed out for you. Either way you get ingredients, steps and estimated
          nutrition per serving to check and adjust before saving.
        </p>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        {files.length > 0 && (
          <div className="pgrid">
            {files.map((_, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {previews[i] && <img src={previews[i]} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8 }} />}
                {!stage && <button type="button" className="btn sm" style={{ position: 'absolute', right: 4, bottom: 4 }} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label="Remove photo">✕</button>}
              </div>
            ))}
          </div>
        )}
        {files.length < MAX_PHOTOS && !stage && (
          <div className="row">
            <button className="btn grow" onClick={() => camRef.current?.click()}><Icon name="camera" size={18} /> Take photo</button>
            <button className="btn grow" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Choose {files.length ? 'more' : 'photos'}</button>
          </div>
        )}
        <label className="f"><span>Anything to add? (optional)</span>
          <textarea rows={2} value={hint} onChange={(e) => setHint(e.target.value)} disabled={!!stage}
            placeholder="e.g. serves 4, made with turkey mince, no cream" maxLength={500} />
        </label>
        <ErrorLine>{err}</ErrorLine>
        {stage ? (
          <div className="row">
            <span className="small muted row grow"><Spinner /> {stage === 'reading' ? 'Writing your recipe… this takes 10–40 seconds' : 'Saving the photo…'}</span>
            <button className="btn ghost sm" onClick={() => { abort.current?.abort(); setStage(null); }}>Cancel</button>
          </div>
        ) : (
          <button className="btn primary" onClick={run} disabled={!files.length}>✨ Create recipe</button>
        )}
        <span className="small muted">Uses {model} with your OpenAI key; the photos go straight from this device to OpenAI.</span>
      </div>
    </Panel>
  );
}
