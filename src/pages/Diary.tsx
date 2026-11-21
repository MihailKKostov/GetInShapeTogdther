import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  closeDay, copyMeal, diaryRef, logWeight, removeFoodEntry, reopenDay, replaceFoodEntry, setWater,
  weightsCol,
} from '../data/api';
import { doc } from 'firebase/firestore';
import { MEALS, type DiaryDay, type FoodEntry, type Meal, type Nutrients, type WeightEntry } from '../data/types';
import { FoodPicker } from '../components/FoodPicker';
import {
  ActionButton, ErrorLine, Meter, Modal, NumInput, Panel, Skeleton, Toggle, useToast,
} from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useDoc } from '../hooks/useFirestore';
import { useMe } from '../hooks/useSession';
import { addDays, dateKey, fmtDay } from '../lib/dates';
import { dayBudget, dayTotals, isOnTarget, macroGrams, scaleNutrients } from '../lib/nutrition';
import { fmtNum, kgTo, toKg, weightUnit } from '../lib/units';

export default function Diary() {
  const { uid, settings } = useMe();
  const [params, setParams] = useSearchParams();
  const today = dateKey();
  const date = params.get('d') && params.get('d')! <= today ? params.get('d')! : today;
  const setDate = (d: string) => setParams(d === today ? {} : { d }, { replace: true });
  const day = useDoc<DiaryDay>(diaryRef(uid, date), `diary:${uid}:${date}`);
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const totals = dayTotals(day.data ?? undefined);
  const budget = dayBudget(settings, day.data ?? undefined);
  const macros = macroGrams(budget, settings.macroPct);
  const closed = !!day.data?.closed;
  const onTarget = isOnTarget(settings, totals.kcal, budget);
  const lo = Math.round(budget * (1 - settings.bandLowerPct / 100));
  const hi = Math.round(budget * (1 + settings.bandUpperPct / 100));
  const remaining = budget - Math.round(totals.kcal);

  return (
    <div className="page">
      <div className="daynav">
        <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">←</button>
        <div className="mid">
          <b>{fmtDay(date)}</b>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick date" />
        </div>
        <button onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">→</button>
      </div>

      {day.loading ? <Skeleton h={160} label="LOADING DAY" /> : (
        <Panel
          title="ENERGY"
          idx="01"
          right={closed ? <span className={`stamp ${day.data?.onTarget ? '' : 'miss'}`} style={{ fontSize: 10 }}>{day.data?.onTarget ? 'ON TARGET' : 'CLOSED'}</span> : <span className="muted">OPEN</span>}
        >
          <div className="col gap2">
            <div className="row between top wrap">
              <div>
                <div className="flabel">REMAINING</div>
                <div className={`mono-big ${remaining < 0 ? 'bad' : ''}`}>{fmtNum(remaining)}<small className="muted" style={{ fontSize: 12 }}> kcal</small></div>
              </div>
              <table className="kv" style={{ width: 'auto' }}>
                <tbody>
                  <tr><th>GOAL</th><td className="n">{fmtNum(settings.calorieGoal)}</td></tr>
                  {settings.addExerciseCalories && <tr><th>+ EXERCISE</th><td className="n">{fmtNum(day.data?.exerciseKcal ?? 0)}</td></tr>}
                  <tr><th>− FOOD</th><td className="n">{fmtNum(totals.kcal)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <Meter lg value={totals.kcal} max={Math.max(hi * 1.1, totals.kcal)} band={[lo, hi]} ticks={[budget]}
                cls={totals.kcal > hi ? 'over' : onTarget ? 'ok' : ''} />
              <div className="row between small muted">
                <span>0</span>
                <span>TARGET BAND {fmtNum(lo)}–{fmtNum(hi)}</span>
              </div>
            </div>
            <MacroRows totals={totals} goals={{ ...macros, fiber: settings.fiberGoal, sodiumMg: settings.sodiumMaxMg }} />
          </div>
        </Panel>
      )}

      {MEALS.map((m, i) => (
        <MealPanel
          key={m}
          idx={String(i + 2).padStart(2, '0')}
          meal={m}
          date={date}
          entries={(day.data?.entries ?? []).filter((e) => e.meal === m)}
          onAdd={() => setAdding(m)}
          onEdit={setEditing}
          locked={closed}
        />
      ))}

      <WaterPanel date={date} ml={day.data?.waterMl ?? 0} goal={settings.waterGoalMl} />
      <WeightPanel date={date} />
      <ClosePanel date={date} day={day.data} totals={totals} budget={budget} onTarget={onTarget} />

      {adding && <FoodPicker date={date} meal={adding} onClose={() => setAdding(null)} />}
      {editing && <EntryEditor date={date} entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MacroRows({ totals, goals }: { totals: Nutrients; goals: { protein: number; carbs: number; fat: number; fiber: number; sodiumMg: number } }) {
  const rows: { k: keyof Nutrients; l: string; g: number; u: string; max?: boolean }[] = [
    { k: 'protein', l: 'PROTEIN', g: goals.protein, u: 'g' },
    { k: 'carbs', l: 'CARBS', g: goals.carbs, u: 'g' },
    { k: 'fat', l: 'FAT', g: goals.fat, u: 'g' },
    { k: 'fiber', l: 'FIBER', g: goals.fiber, u: 'g' },
    { k: 'sodiumMg', l: 'SODIUM', g: goals.sodiumMg, u: 'mg', max: true },
  ];
  return (
    <div className="col" style={{ gap: 6 }}>
      {rows.map((r) => {
        const v = totals[r.k] ?? 0;
        const over = r.max ? v > r.g : false;
        const done = !r.max && v >= r.g;
        return (
          <div key={r.k} className="mrow">
            <span className="l">{r.l}</span>
            <Meter value={v} max={Math.max(r.g, v)} cls={over ? 'over' : done ? 'ok' : ''} ticks={[r.g]} />
            <span className="v"><b>{fmtNum(v)}</b><span className="muted"> / {fmtNum(r.g)}{r.u}{r.max ? ' max' : ''}</span></span>
          </div>
        );
      })}
      <div className="small muted">SUGARS {fmtNum(totals.sugar)} g · SAT FAT {fmtNum(totals.satFat, 1)} g</div>
    </div>
  );
}

function MealPanel({ idx, meal, date, entries, onAdd, onEdit, locked }: {
  idx: string; meal: Meal; date: string; entries: FoodEntry[]; onAdd: () => void; onEdit: (e: FoodEntry) => void; locked: boolean;
}) {
  const { uid } = useMe();
  const toast = useToast();
  const kcal = entries.reduce((s, e) => s + e.n.kcal, 0);
  const copy = useAction(async () => {
    const n = await copyMeal(uid, addDays(date, -1), date, meal);
    toast(`Copied ${n} item${n === 1 ? '' : 's'} from yesterday`);
  });
  return (
    <Panel
      idx={idx}
      title={meal}
      tight
      right={<b>{fmtNum(kcal)} <span className="muted">kcal</span></b>}
      footer={locked ? <span className="small muted">Day closed — reopen to edit</span> : (
        <>
          <button className="btn sm primary" onClick={onAdd}>+ ADD FOOD</button>
          {entries.length === 0 && (
            <ActionButton size="sm" variant="ghost" state={copy.state} onClick={() => copy.run()} pendingLabel="COPYING" errorLabel="NOTHING YESTERDAY">
              ⧉ COPY YESTERDAY
            </ActionButton>
          )}
        </>
      )}
    >
      {entries.length === 0 ? <div className="small faint" style={{ padding: '8px 12px' }}>— empty —</div> : (
        <table className="kv">
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={locked ? '' : 'click'} onClick={() => !locked && onEdit(e)}>
                <td>
                  <div className="trunc" style={{ maxWidth: '52vw' }}>{e.name}</div>
                  <div className="small muted">{e.source === 'quick' ? 'quick add' : `${fmtNum(e.grams)} g`} · P{fmtNum(e.n.protein)} C{fmtNum(e.n.carbs)} F{fmtNum(e.n.fat)}</div>
                </td>
                <td className="n"><b>{fmtNum(e.n.kcal)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function EntryEditor({ date, entry, onClose }: { date: string; entry: FoodEntry; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const [grams, setGrams] = useState<number | ''>(entry.grams);
  const per100 = scaleNutrients(entry.n, entry.grams ? (100 * 100) / entry.grams : 100);
  const n = entry.source === 'quick' ? entry.n : scaleNutrients(per100, Number(grams) || 0);
  const save = useAction(async () => {
    await replaceFoodEntry(uid, date, { ...entry, grams: Number(grams) || 0, n });
    return true;
  });
  const del = useAction(async () => { await removeFoodEntry(uid, date, entry); return true; });
  return (
    <Modal title="EDIT ENTRY" onClose={onClose}>
      <div><h2 style={{ textTransform: 'none' }}>{entry.name}</h2>{entry.brand && <div className="small muted">{entry.brand}</div>}</div>
      {entry.source !== 'quick' && (
        <label className="f"><span>Amount</span><NumInput value={grams} onChange={setGrams} unit="g" autoFocus /></label>
      )}
      <div className="stats c4" style={{ border: '1px solid var(--line)', borderRight: 0, borderBottom: 0 }}>
        <div className="stat"><div className="k">KCAL</div><div className="v">{fmtNum(n.kcal)}</div></div>
        <div className="stat"><div className="k">PROT</div><div className="v">{fmtNum(n.protein, 1)}</div></div>
        <div className="stat"><div className="k">CARB</div><div className="v">{fmtNum(n.carbs, 1)}</div></div>
        <div className="stat"><div className="k">FAT</div><div className="v">{fmtNum(n.fat, 1)}</div></div>
      </div>
      <div className="row">
        <ActionButton variant="danger" state={del.state} pendingLabel="REMOVING" onClick={async () => { if (await del.run()) { toast('Entry removed'); onClose(); } }}>
          REMOVE
        </ActionButton>
        <span className="grow" />
        {entry.source !== 'quick' && (
          <ActionButton variant="primary" state={save.state} onClick={async () => { if (await save.run()) { toast('Entry updated'); onClose(); } }}>
            SAVE
          </ActionButton>
        )}
      </div>
    </Modal>
  );
}

function WaterPanel({ date, ml, goal }: { date: string; ml: number; goal: number }) {
  const { uid } = useMe();
  const [pending, setPending] = useState<number | null>(null);
  const shown = pending ?? ml;
  const change = async (d: number) => {
    const next = Math.max(0, shown + d);
    setPending(next);
    try { await setWater(uid, date, next); } finally { setPending(null); }
  };
  const glasses = Math.round(goal / 250);
  const filled = Math.floor(shown / 250);
  return (
    <Panel idx="06" title="WATER" right={<b>{fmtNum(shown)} <span className="muted">/ {fmtNum(goal)} ml</span></b>}>
      <div className="row between wrap">
        <div className="row" style={{ gap: 3, fontSize: 16 }} aria-label={`${filled} of ${glasses} glasses`}>
          {Array.from({ length: Math.max(glasses, filled) }, (_, i) => (
            <span key={i} style={{ color: i < filled ? 'var(--accent)' : 'var(--faint)' }}>{i < filled ? '■' : '□'}</span>
          ))}
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => change(-250)} disabled={shown <= 0}>−250</button>
          <button className="btn sm primary" onClick={() => change(250)}>+250 ML</button>
        </div>
      </div>
    </Panel>
  );
}

function WeightPanel({ date }: { date: string }) {
  const { uid, units } = useMe();
  const toast = useToast();
  const w = useDoc<WeightEntry>(doc(weightsCol(uid), date), `w:${uid}:${date}`);
  const [val, setVal] = useState<number | ''>('');
  const save = useAction(async () => {
    if (val === '' || val <= 0) throw new Error('Enter your weight');
    await logWeight(uid, date, toKg(units, val));
    setVal('');
    toast(`Weight logged for ${fmtDay(date).toLowerCase()}`);
  });
  return (
    <Panel idx="07" title="WEIGHT" right={w.data ? <b>{fmtNum(kgTo(units, w.data.kg), 1)} <span className="muted">{weightUnit(units)}</span></b> : <span className="muted">NOT LOGGED</span>}>
      <div className="row">
        <div className="grow"><NumInput value={val} onChange={setVal} unit={weightUnit(units)} placeholder={w.data ? fmtNum(kgTo(units, w.data.kg), 1) : 'weigh-in'} ariaLabel="Weight" /></div>
        <ActionButton state={save.state} onClick={() => save.run()} doneLabel="LOGGED">{w.data ? 'UPDATE' : 'LOG'}</ActionButton>
      </div>
      <ErrorLine>{save.error}</ErrorLine>
      <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>Weight is private unless you share it from your profile.</p>
    </Panel>
  );
}

function ClosePanel({ date, day, totals, budget, onTarget }: { date: string; day: DiaryDay | null; totals: Nutrients; budget: number; onTarget: boolean }) {
  const { uid, settings } = useMe();
  const toast = useToast();
  const [share, setShare] = useState(true);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ onTarget: boolean; streak: number } | null>(null);
  const close = useAction(async () => {
    if (!day?.entries?.length) throw new Error('Log some food before closing the day');
    const r = await closeDay(uid, date, settings, day, { share, note: note.trim() });
    setResult(r);
    toast(r.onTarget ? `Day on target · streak ${r.streak}` : 'Day closed', r.onTarget ? 'ok' : 'info');
  }, { minPending: 700 });
  const reopen = useAction(async () => { await reopenDay(uid, date); setResult(null); });

  if (day?.closed) {
    return (
      <Panel idx="08" title="DAY CLOSED">
        <div className="col">
          <div className="row between wrap">
            <span className={`stamp ${day.onTarget ? '' : 'miss'}`}>{day.onTarget ? 'ON TARGET ✓' : 'OUTSIDE BAND'}</span>
            {result && <span className="small">STREAK <b>{result.streak}</b> DAYS</span>}
          </div>
          <p className="small muted">{fmtNum(day.totals?.kcal ?? totals.kcal)} kcal of a {fmtNum(day.budget ?? budget)} kcal budget. Reopen to edit entries — the day will be re-evaluated when you close it again.</p>
          <ActionButton size="sm" state={reopen.state} onClick={() => reopen.run()} pendingLabel="REOPENING">REOPEN DAY</ActionButton>
        </div>
      </Panel>
    );
  }
  return (
    <Panel idx="08" title="CLOSE DAY" right={<span className={onTarget ? 'ok' : 'muted'}>{onTarget ? '● IN BAND' : '○ OUT OF BAND'}</span>}>
      <div className="col">
        <p className="small muted" style={{ margin: 0 }}>
          Closing locks the day and counts it toward your streak if calories are within {settings.bandLowerPct}% under / {settings.bandUpperPct}% over your budget.
        </p>
        <div className="row wrap">
          <Toggle on={share} onChange={setShare} label="SHARE TO FEED" />
          <span className="small muted">{share ? 'friends see kcal, macros & streak — not the food list' : 'stays private'}</span>
        </div>
        {share && <input placeholder="optional note (e.g. meal prepped all week)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />}
        <ErrorLine>{close.error}</ErrorLine>
        <ActionButton variant={onTarget ? 'accent' : 'primary'} size="lg" block state={close.state} onClick={() => close.run()} pendingLabel="EVALUATING DAY" doneLabel="CLOSED">
          CLOSE {fmtDay(date)} →
        </ActionButton>
      </div>
    </Panel>
  );
}
