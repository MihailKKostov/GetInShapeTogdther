import { useEffect, useMemo, useRef, useState } from 'react';
import { query } from 'firebase/firestore';
import { addFoodEntry, deleteCustomFood, foodsCol, recentsRef, saveCustomFood } from '../data/api';
import type { Food, FoodEntry, Meal, Nutrients } from '../data/types';
import { useAction } from '../hooks/useAction';
import { useDoc, useQuery } from '../hooks/useFirestore';
import { useMe } from '../hooks/useSession';
import { randomId } from '../lib/avatar';
import { lookupBarcode, searchOpenFoodFacts } from '../lib/foodSearch';
import { searchGeneric } from '../lib/genericFoods';
import { NUTRIENT_LABELS, scaleNutrients } from '../lib/nutrition';
import { fmtNum } from '../lib/units';
import { ActionButton, Empty, ErrorLine, Icon, Modal, NumInput, Seg, Skeleton, Spinner, useToast } from './ui';
import { NutrientSummary } from './NutrientSummary';

type Tab = 'search' | 'recent' | 'mine' | 'quick' | 'scan';

export function FoodPicker({ date, meal, onClose }: { date: string; meal: Meal; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('search');
  const [picked, setPicked] = useState<Food | null>(null);
  const hasScanner = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  return (
    <Modal title={`Add to ${meal}`} onClose={onClose}>
      {picked ? (
        <AmountStep food={picked} date={date} meal={meal} onBack={() => setPicked(null)} onDone={onClose} />
      ) : (
        <>
          <div className="tabs">
            {(['search', 'recent', 'mine', 'quick', ...(hasScanner ? ['scan'] : [])] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t === 'mine' ? 'My foods' : t === 'quick' ? 'Quick add' : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {tab === 'search' && <SearchTab onPick={setPicked} />}
          {tab === 'recent' && <RecentTab onPick={setPicked} />}
          {tab === 'mine' && <MyFoodsTab onPick={setPicked} />}
          {tab === 'quick' && <QuickAdd date={date} meal={meal} onDone={onClose} />}
          {tab === 'scan' && <ScanTab onPick={setPicked} />}
        </>
      )}
    </Modal>
  );
}

function FoodRow({ f, onPick }: { f: Food; onPick: (f: Food) => void }) {
  const serving = f.servingG ? scaleNutrients(f.per100, f.servingG) : null;
  return (
    <button type="button" className="li" onClick={() => onPick(f)}>
      <div className="main">
        <div className="name"><span className={`src ${f.source === 'off' ? 'off' : f.source === 'generic' ? 'ref' : 'my'}`}>{f.source === 'off' ? 'OFF' : f.source === 'generic' ? 'REF' : 'MY'}</span>{f.name}</div>
        <div className="sub">{f.brand ? `${f.brand} · ` : ''}{serving ? `${f.servingLabel ?? ''} (${fmtNum(f.servingG)} g)` : 'per 100 g'}</div>
      </div>
      <div className="end">
        <b>{fmtNum(serving ? serving.kcal : f.per100.kcal)}</b> <span className="small muted">kcal</span>
        <div className="small muted">P {fmtNum((serving ?? f.per100).protein)} · C {fmtNum((serving ?? f.per100).carbs)} · F {fmtNum((serving ?? f.per100).fat)}</div>
      </div>
    </button>
  );
}

function SearchTab({ onPick }: { onPick: (f: Food) => void }) {
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { uid } = useMe();
  const mine = useQuery<Food>(query(foodsCol(uid)), `foods:${uid}`);
  const term = q.trim();
  const local = useMemo(() => {
    const t = term.toLowerCase();
    const my = t ? mine.data.filter((f) => f.name.toLowerCase().includes(t)) : [];
    return [...my, ...searchGeneric(term)];
  }, [term, mine.data]);

  useEffect(() => {
    if (term.length < 3) { setRemote([]); setLoading(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    setErr(null);
    const t = setTimeout(() => {
      searchOpenFoodFacts(term, ctl.signal)
        .then((r) => setRemote(r))
        .catch((e) => { if (e.name !== 'AbortError') setErr('Food database unreachable — try again or use quick add'); })
        .finally(() => !ctl.signal.aborted && setLoading(false));
    }, 450);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [term]);

  return (
    <div className="col">
      <input autoFocus placeholder="Search foods, e.g. greek yogurt" value={q} onChange={(e) => setQ(e.target.value)} />
      {!term && <p className="small muted" style={{ margin: 0 }}>Search common foods, your own foods, and packaged products from Open Food Facts.</p>}
      {local.length > 0 && (
        <div className="panel">
          <div className="list-sep">Common & my foods</div>
          <div className="list">{local.map((f) => <FoodRow key={f.id} f={f} onPick={onPick} />)}</div>
        </div>
      )}
      {term.length >= 3 && (
        <div className="panel">
          <div className="list-sep row">Packaged foods {loading && <Spinner />}</div>
          {loading && remote.length === 0 && <div style={{ padding: '4px 16px 12px' }}><Skeleton h={64} /></div>}
          <div className="list">{remote.map((f) => <FoodRow key={f.id} f={f} onPick={onPick} />)}</div>
          {!loading && !err && remote.length === 0 && <div className="small muted" style={{ padding: '4px 16px 12px' }}>No packaged foods matched.</div>}
          {err && <div style={{ padding: '4px 16px 12px' }}><ErrorLine>{err}</ErrorLine></div>}
        </div>
      )}
    </div>
  );
}

function RecentTab({ onPick }: { onPick: (f: Food) => void }) {
  const { uid } = useMe();
  const rec = useDoc<{ items: Food[] }>(recentsRef(uid), `rec:${uid}`);
  if (rec.loading) return <Skeleton h={120} />;
  const items = rec.data?.items ?? [];
  if (!items.length) return <Empty icon="🕘" title="No recent foods">Foods you log show up here for quick re-adding.</Empty>;
  return <div className="panel list">{items.map((f) => <FoodRow key={f.id} f={f} onPick={onPick} />)}</div>;
}

function MyFoodsTab({ onPick }: { onPick: (f: Food) => void }) {
  const { uid } = useMe();
  const foods = useQuery<Food>(query(foodsCol(uid)), `foods:${uid}`);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  if (creating) return <CustomFoodForm onDone={(f) => { setCreating(false); if (f) onPick(f); }} />;
  return (
    <div className="col">
      <button className="btn soft block" onClick={() => setCreating(true)}>+ Create custom food</button>
      {foods.loading ? <Skeleton h={100} /> : foods.data.length === 0 ? (
        <Empty icon="🥣" title="No custom foods">Create foods for home recipes or products missing from the database.</Empty>
      ) : (
        <div className="panel list">
          {foods.data.map((f) => (
            <div key={f.id} className="row" style={{ paddingRight: 8 }}>
              <div className="grow"><FoodRow f={f} onPick={onPick} /></div>
              <button
                className="icon-btn"
                aria-label={`Delete ${f.name}`}
                onClick={async () => { if (confirm(`Delete ${f.name}?`)) { await deleteCustomFood(uid, f.id); toast('Food deleted'); } }}
              ><Icon name="close" size={18} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EXTRA: (keyof Nutrients)[] = ['fiber', 'sugar', 'satFat', 'sodiumMg'];

function CustomFoodForm({ onDone }: { onDone: (f: Food | null) => void }) {
  const { uid } = useMe();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [servingG, setServingG] = useState<number | ''>(100);
  const [label, setLabel] = useState('1 serving');
  const [vals, setVals] = useState<Partial<Record<keyof Nutrients, number | ''>>>({ kcal: '', protein: '', carbs: '', fat: '' });
  const save = useAction(async () => {
    if (!name.trim()) throw new Error('Name is required');
    const g = Number(servingG) || 100;
    if (vals.kcal === '' || vals.kcal == null) throw new Error('Calories are required');
    const k = 100 / g;
    const per100 = {} as Nutrients;
    for (const key of Object.keys(NUTRIENT_LABELS) as (keyof Nutrients)[]) {
      const v = vals[key];
      if (v !== '' && v != null) (per100[key] as number) = Math.round(Number(v) * k * 100) / 100;
      else if (['kcal', 'protein', 'carbs', 'fat'].includes(key)) (per100[key] as number) = 0;
    }
    const food: Food = { id: randomId(12), source: 'custom', name: name.trim(), brand: brand.trim() || undefined, per100, servingG: g, servingLabel: label || undefined };
    await saveCustomFood(uid, food);
    return food;
  });
  return (
    <div className="col">
      <div className="fgrid">
        <label className="f"><span>Name *</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label className="f"><span>Brand</span><input value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
        <label className="f"><span>Serving label</span><input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="f"><span>Serving weight</span><NumInput value={servingG} onChange={setServingG} unit="g" /></label>
      </div>
      <div className="flabel">Nutrition per serving</div>
      <div className="fgrid">
        {(['kcal', 'protein', 'carbs', 'fat', ...EXTRA] as (keyof Nutrients)[]).map((k) => (
          <label key={k} className="f">
            <span>{NUTRIENT_LABELS[k].label}{k === 'kcal' ? ' *' : ''}</span>
            <NumInput value={vals[k] ?? ''} onChange={(v) => setVals((s) => ({ ...s, [k]: v }))} unit={NUTRIENT_LABELS[k].unit} />
          </label>
        ))}
      </div>
      <ErrorLine>{save.error}</ErrorLine>
      <div className="row">
        <button className="btn" onClick={() => onDone(null)}>Back</button>
        <span className="grow" />
        <ActionButton variant="primary" state={save.state} onClick={async () => { const f = await save.run(); if (f) onDone(f); }}>
          Save food
        </ActionButton>
      </div>
    </div>
  );
}

function QuickAdd({ date, meal, onDone }: { date: string; meal: Meal; onDone: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | ''>('');
  const [p, setP] = useState<number | ''>('');
  const [c, setC] = useState<number | ''>('');
  const [f, setF] = useState<number | ''>('');
  const add = useAction(async () => {
    if (kcal === '' || kcal <= 0) throw new Error('Enter calories');
    const n: Nutrients = { kcal: Math.round(kcal), protein: Number(p) || 0, carbs: Number(c) || 0, fat: Number(f) || 0 };
    const food: Food = { id: `quick:${randomId(8)}`, source: 'quick', name: name.trim() || 'Quick add', per100: n, servingG: 100, servingLabel: '1 entry' };
    const entry: FoodEntry = { id: randomId(12), meal, foodId: food.id, source: 'quick', name: food.name, grams: 100, n, addedAt: Date.now() };
    await addFoodEntry(uid, date, entry, food);
    return true;
  });
  return (
    <div className="col">
      <label className="f"><span>Label</span><input value={name} placeholder="e.g. restaurant lunch" onChange={(e) => setName(e.target.value)} /></label>
      <div className="fgrid">
        <label className="f"><span>Calories *</span><NumInput value={kcal} onChange={setKcal} unit="kcal" autoFocus /></label>
        <label className="f"><span>Protein</span><NumInput value={p} onChange={setP} unit="g" /></label>
        <label className="f"><span>Carbs</span><NumInput value={c} onChange={setC} unit="g" /></label>
        <label className="f"><span>Fat</span><NumInput value={f} onChange={setF} unit="g" /></label>
      </div>
      <ErrorLine>{add.error}</ErrorLine>
      <ActionButton variant="primary" block state={add.state} onClick={async () => {
        if (await add.run()) { toast(`Added ${kcal} kcal to ${meal}`); onDone(); }
      }}>Add {kcal || 0} kcal</ActionButton>
    </div>
  );
}

function ScanTab({ onPick }: { onPick: (f: Food) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Starting camera…');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const lookup = async (c: string) => {
    setStatus(`Looking up ${c}…`);
    setErr(null);
    const f = await lookupBarcode(c).catch(() => null);
    if (f) onPick(f);
    else { setErr(`No product found for ${c}`); setStatus('Point the camera at a barcode'); }
  };
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setStatus('Point the camera at a barcode');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const det = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        while (!stop) {
          const r = await det.detect(video.current).catch(() => []);
          if (r.length) { stop = true; lookup(r[0].rawValue); break; }
          await new Promise((res) => setTimeout(res, 250));
        }
      } catch {
        setStatus('Camera unavailable');
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="col">
      <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '4/3', objectFit: 'cover' }} />
      <div className="small row muted"><Spinner /> {status}</div>
      <ErrorLine>{err}</ErrorLine>
      <div className="row">
        <input placeholder="Or type the barcode" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <button className="btn" onClick={() => code && lookup(code)}>Look up</button>
      </div>
    </div>
  );
}

function AmountStep({ food, date, meal, onBack, onDone }: { food: Food; date: string; meal: Meal; onBack: () => void; onDone: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const hasServing = !!food.servingG;
  const [mode, setMode] = useState<'serving' | 'g'>(hasServing ? 'serving' : 'g');
  const [qty, setQty] = useState<number | ''>(hasServing ? 1 : 100);
  const grams = mode === 'serving' ? (Number(qty) || 0) * (food.servingG ?? 100) : Number(qty) || 0;
  const n = scaleNutrients(food.per100, grams);
  const add = useAction(async () => {
    if (grams <= 0) throw new Error('Enter an amount');
    const entry: FoodEntry = { id: randomId(12), meal, foodId: food.id, source: food.source, name: food.name, brand: food.brand, grams, n, addedAt: Date.now() };
    await addFoodEntry(uid, date, entry, food);
    return true;
  });
  return (
    <div className="col">
      <div>
        <h2>{food.name}</h2>
        {food.brand && <div className="small muted">{food.brand}</div>}
      </div>
      {hasServing && (
        <Seg value={mode} onChange={(m) => { setMode(m); setQty(m === 'serving' ? 1 : Math.round(food.servingG ?? 100)); }}
          options={[{ v: 'serving', l: `Servings (${food.servingLabel ?? ''} · ${fmtNum(food.servingG)} g)` }, { v: 'g', l: 'Grams' }]} block />
      )}
      <label className="f">
        <span>{mode === 'serving' ? 'Number of servings' : 'Amount'}</span>
        <NumInput value={qty} onChange={setQty} unit={mode === 'serving' ? '×' : 'g'} autoFocus />
      </label>
      <div className="row wrap" style={{ gap: 4 }}>
        {(mode === 'serving' ? [0.5, 1, 1.5, 2] : [50, 100, 150, 200]).map((v) => (
          <button key={v} className={`btn sm ${qty === v ? 'on' : ''}`} onClick={() => setQty(v)}>{v}{mode === 'g' ? 'g' : '×'}</button>
        ))}
      </div>
      <NutrientSummary n={n} />
      <table className="kv">
        <tbody>
          {(['fiber', 'sugar', 'satFat', 'sodiumMg'] as (keyof Nutrients)[]).filter((k) => n[k] != null).map((k) => (
            <tr key={k}>
              <th>{NUTRIENT_LABELS[k].label}</th>
              <td className="n"><b>{fmtNum(n[k], k === 'sodiumMg' ? 0 : 1)}</b> {NUTRIENT_LABELS[k].unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorLine>{add.error}</ErrorLine>
      <div className="row">
        <button className="btn" onClick={onBack}>Back</button>
        <span className="grow" />
        <ActionButton variant="primary" state={add.state} onClick={async () => {
          if (await add.run()) {
            toast(`${food.name} → ${meal}`);
            onDone();
          }
        }}>Add · {fmtNum(n.kcal)} kcal</ActionButton>
      </div>
    </div>
  );
}
