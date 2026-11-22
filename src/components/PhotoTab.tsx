import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addFoodEntry } from '../data/api';
import type { Food, FoodEntry, Meal, Nutrients } from '../data/types';
import { useObjectUrls } from '../hooks/useObjectUrls';
import { useMe } from '../hooks/useSession';
import { randomId } from '../lib/avatar';
import { aiSettings, analyzeFoodPhoto, type PhotoItem } from '../lib/foodPhoto';
import { resizeImage } from '../lib/images';
import { fmtNum } from '../lib/units';
import { Empty, ErrorLine, Icon, NumInput, Spinner, useToast } from './ui';

/** Re-renders when the per-device AI settings change (here or in another tab). */
export function useAiSettings() {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener('wefit:ai-settings', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('wefit:ai-settings', on); window.removeEventListener('storage', on); };
  }, []);
  return { key: aiSettings.getKey(), model: aiSettings.getModel() };
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read the photo'));
    r.readAsDataURL(b);
  });
}

interface Row extends PhotoItem { id: string; on: boolean; origGrams: number }

/** Scale an AI estimate to a new portion size. */
function scaled(r: Row): Nutrients {
  const k = r.origGrams > 0 ? r.grams / r.origGrams : 1;
  return {
    kcal: Math.round(r.kcal * k), protein: Math.round(r.protein * k * 10) / 10,
    carbs: Math.round(r.carbs * k * 10) / 10, fat: Math.round(r.fat * k * 10) / 10, fiber: Math.round(r.fiber * k * 10) / 10,
  };
}

export function PhotoTab({ date, meal, onDone }: { date: string; meal: Meal; onDone: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const { key, model } = useAiSettings();
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState('');
  const abort = useRef<AbortController | null>(null);
  const [preview] = useObjectUrls([file]);
  useEffect(() => () => abort.current?.abort(), []);

  if (!key) {
    return (
      <Empty icon="📸" title="Estimate calories from a photo">
        <p>Snap your meal and get an estimate of each food, its portion and nutrition. This uses your own OpenAI API key, which you add once in Settings.</p>
        <Link className="btn primary" to="/settings#ai">Add OpenAI key in Settings</Link>
      </Empty>
    );
  }

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f); setRows(null); setErr(null); setNote('');
  };

  const analyze = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setRows(null);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const img = await resizeImage(file, 1024, 'image/jpeg', 0.85);
      const res = await analyzeFoodPhoto(await blobToDataUrl(img.blob), { key, model, hint, signal: ctl.signal });
      setRows(res.items.map((i) => ({ ...i, id: randomId(8), on: true, origGrams: i.grams })));
      setNote(res.note);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      if (!ctl.signal.aborted) setBusy(false);
    }
  };

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const chosen = (rows ?? []).filter((r) => r.on && r.name.trim());
  const total = chosen.reduce((s, r) => s + scaled(r).kcal, 0);

  const add = () => {
    chosen.forEach((r, i) => {
      const n = scaled(r);
      const grams = r.grams > 0 ? r.grams : 100;
      const per100 = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Math.round(((v as number) * 100 / grams) * 10) / 10])) as unknown as Nutrients;
      const food: Food = { id: `photo:${randomId(10)}`, source: 'photo', name: r.name.trim(), per100, servingG: grams, servingLabel: 'AI estimate' };
      const entry: FoodEntry = { id: randomId(12), meal, foodId: food.id, source: 'photo', name: food.name, grams, n, addedAt: Date.now() + i };
      addFoodEntry(uid, date, entry, food);
    });
    toast(`Added ${chosen.length} item${chosen.length === 1 ? '' : 's'} · ${fmtNum(total)} kcal to ${meal}`);
    onDone();
  };

  return (
    <div className="col">
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {preview ? (
        <img src={preview} alt="Your meal" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 12 }} />
      ) : (
        <p className="small muted" style={{ margin: 0 }}>Take a photo from above with the whole plate in view. Estimates are a starting point: check the portions before adding.</p>
      )}
      <div className="row">
        <button className="btn grow" onClick={() => camRef.current?.click()} disabled={busy}><Icon name="camera" size={18} /> {file ? 'Retake' : 'Take photo'}</button>
        <button className="btn grow" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="upload" size={18} /> Choose photo</button>
      </div>
      {file && !rows && (
        <>
          <input placeholder="Anything the photo doesn't show? e.g. cooked in butter, half eaten" value={hint} maxLength={300} onChange={(e) => setHint(e.target.value)} />
          <button className="btn primary" onClick={analyze} disabled={busy}>
            {busy ? <><Spinner /> Analyzing photo…</> : 'Estimate calories'}
          </button>
        </>
      )}
      <ErrorLine>{err}</ErrorLine>
      {err && /Settings/.test(err) && <Link className="small" to="/settings#ai">Open Settings</Link>}

      {rows && rows.length === 0 && <Empty icon="🤔" title="No food found">{note || 'Try another photo.'}</Empty>}
      {rows && rows.length > 0 && (
        <>
          {note && <p className="small muted" style={{ margin: 0 }}>{note}</p>}
          <div className="panel list">
            {rows.map((r) => {
              const n = scaled(r);
              return (
                <div key={r.id} className="li" style={{ alignItems: 'flex-start', opacity: r.on ? 1 : 0.45 }}>
                  <input type="checkbox" checked={r.on} onChange={(e) => update(r.id, { on: e.target.checked })} aria-label={`Include ${r.name}`} style={{ marginTop: 12 }} />
                  <div className="main col" style={{ gap: 6 }}>
                    <input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} aria-label="Food name" />
                    <div className="row" style={{ gap: 6 }}>
                      <div style={{ width: 110 }}><NumInput value={r.grams} onChange={(v) => update(r.id, { grams: v === '' ? 0 : v })} unit="g" ariaLabel="Portion" /></div>
                      <span className="small muted">P {fmtNum(n.protein)} · C {fmtNum(n.carbs)} · F {fmtNum(n.fat)}</span>
                    </div>
                  </div>
                  <div className="end">
                    <b>{fmtNum(n.kcal)}</b> <span className="small muted">kcal</span>
                    <div><span className={`pill ${r.confidence === 'high' ? 'ok' : r.confidence === 'low' ? 'warn' : ''}`} style={{ fontSize: 11 }}>{r.confidence}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="row between">
            <button className="btn ghost sm" onClick={() => { setRows(null); }}>Try again</button>
            <button className="btn primary" onClick={add} disabled={!chosen.length}>Add {chosen.length} · {fmtNum(total)} kcal</button>
          </div>
        </>
      )}
      <p className="small faint" style={{ margin: 0 }}>Photos are sent to OpenAI using your API key ({model}) and billed to your OpenAI account. They aren't stored by WeFit.</p>
    </div>
  );
}
