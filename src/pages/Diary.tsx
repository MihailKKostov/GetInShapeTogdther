import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import {
  closeDay, copyMeal, diaryRef, logWeight, removeFoodEntry, reopenDay, replaceFoodEntry, setWater,
  weightsCol,
} from '../data/api';
import { MEALS, type DiaryDay, type FoodEntry, type Meal, type Nutrients, type WeightEntry } from '../data/types';
import { FoodPicker } from '../components/FoodPicker';
import { NutrientSummary } from '../components/NutrientSummary';
import { EmojiField } from '../components/EmojiText';
import {
  ActionButton, ErrorLine, Icon, Meter, Modal, NumInput, Panel, Ring, Skeleton, Toggle, useToast,
} from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useDoc } from '../hooks/useFirestore';
import { useMe } from '../hooks/useSession';
import { addDays, dateKey, parseKey } from '../lib/dates';
import { dayBudget, dayTotals, isOnTarget, macroGrams, scaleNutrients } from '../lib/nutrition';
import { fmtNum, kgTo, toKg, weightUnit } from '../lib/units';

const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

export function dayTitle(key: string) {
  const today = dateKey();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'long' });
}

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
  const closed = !!day.data?.closed;
  const onTarget = isOnTarget(settings, totals.kcal, budget);

  return (
    <div className="page">
      <div className="daynav">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><Icon name="left" /></button>
        <div className="mid">
          <b>{dayTitle(date)}</b>
          <span>{parseKey(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick date" />
        </div>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} style={{ opacity: date >= today ? 0.3 : 1 }} aria-label="Next day"><Icon name="right" /></button>
      </div>

      {day.loading ? <Skeleton h={300} /> : <EnergySummary totals={totals} budget={budget} exercise={day.data?.exerciseKcal ?? 0} />}

      <Panel title="Food diary" tight right={closed ? <span className="pill ok">Completed</span> : undefined}>
        <div>
          {MEALS.map((m) => (
            <MealGroup
              key={m}
              meal={m}
              date={date}
              entries={(day.data?.entries ?? []).filter((e) => e.meal === m).sort((a, b) => a.addedAt - b.addedAt)}
              onAdd={() => setAdding(m)}
              onEdit={setEditing}
              locked={closed}
            />
          ))}
        </div>
      </Panel>

      <WaterPanel date={date} ml={day.data?.waterMl ?? 0} goal={settings.waterGoalMl} />
      <WeightPanel date={date} />
      <CompletePanel date={date} day={day.data} totals={totals} budget={budget} onTarget={onTarget} />

      {adding && <FoodPicker date={date} meal={adding} onClose={() => setAdding(null)} />}
      {editing && <EntryEditor date={date} entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EnergySummary({ totals, budget, exercise }: { totals: Nutrients; budget: number; exercise: number }) {
  const { settings } = useMe();
  const [more, setMore] = useState(false);
  const macros = macroGrams(budget, settings.macroPct);
  const remaining = budget - Math.round(totals.kcal);
  const lo = Math.round(budget * (1 - settings.bandLowerPct / 100));
  const hi = Math.round(budget * (1 + settings.bandUpperPct / 100));
  const rows: { l: string; v: number; g: number; u: string; color: string; max?: boolean }[] = [
    { l: 'Energy', v: totals.kcal, g: budget, u: 'kcal', color: 'var(--primary)' },
    { l: 'Protein', v: totals.protein, g: macros.protein, u: 'g', color: 'var(--protein)' },
    { l: 'Carbs', v: totals.carbs, g: macros.carbs, u: 'g', color: 'var(--carbs)' },
    { l: 'Fat', v: totals.fat, g: macros.fat, u: 'g', color: 'var(--fat)' },
  ];
  const extra: typeof rows = [
    { l: 'Fiber', v: totals.fiber ?? 0, g: settings.fiberGoal, u: 'g', color: 'var(--ok)' },
    { l: 'Sodium', v: totals.sodiumMg ?? 0, g: settings.sodiumMaxMg, u: 'mg', color: 'var(--warn)', max: true },
  ];
  return (
    <Panel title="Energy summary">
      <div className="col gap2">
        <div className="rings">
          <Ring value={totals.kcal} max={budget} color="var(--primary)" label={fmtNum(totals.kcal)} sub="kcal" caption="Consumed" />
          <Ring value={exercise} max={Math.max(500, exercise)} color="var(--carbs)" label={fmtNum(exercise)} sub="kcal" caption="Exercise" />
          <Ring value={Math.max(0, remaining)} max={budget} color={remaining < 0 ? 'var(--bad)' : 'var(--ok)'} label={fmtNum(remaining)} sub="kcal" caption="Remaining" />
        </div>
        <div className="col" style={{ gap: 12 }}>
          {(more ? [...rows, ...extra] : rows).map((r) => {
            const over = r.max ? r.v > r.g : r.l === 'Energy' ? r.v > hi : false;
            return (
              <div key={r.l} className="target-row">
                <span>{r.l}</span>
                <span className="v"><b>{fmtNum(r.v)}</b> / {fmtNum(r.g)} {r.u}{r.max ? ' max' : ''}</span>
                <Meter value={r.v} max={Math.max(r.g, r.v)} color={over ? 'var(--bad)' : r.color} />
              </div>
            );
          })}
        </div>
        <div className="row between">
          <span className="small muted">Target range {fmtNum(lo)}–{fmtNum(hi)} kcal{settings.addExerciseCalories && exercise ? ' (incl. exercise)' : ''}</span>
          <button className="btn ghost sm" onClick={() => setMore((m) => !m)}>{more ? 'Less' : 'More nutrients'}</button>
        </div>
      </div>
    </Panel>
  );
}

function MealGroup({ meal, date, entries, onAdd, onEdit, locked }: {
  meal: Meal; date: string; entries: FoodEntry[]; onAdd: () => void; onEdit: (e: FoodEntry) => void; locked: boolean;
}) {
  const { uid } = useMe();
  const toast = useToast();
  const kcal = entries.reduce((s, e) => s + e.n.kcal, 0);
  const copy = useAction(async () => {
    const n = await copyMeal(uid, addDays(date, -1), date, meal);
    toast(`Copied ${n} item${n === 1 ? '' : 's'} from yesterday`);
  });
  return (
    <div style={{ borderTop: meal === 'breakfast' ? 0 : '1px solid var(--line)' }}>
      <div className="row between" style={{ padding: '10px 16px 4px' }}>
        <b>{MEAL_LABEL[meal]}</b>
        <span className="row" style={{ gap: 4 }}>
          <span className="small muted">{fmtNum(kcal)} kcal</span>
          {!locked && (
            <button className="icon-btn" style={{ width: 32, height: 32, color: 'var(--primary)' }} onClick={onAdd} aria-label={`Add food to ${meal}`}>
              <Icon name="plus" size={20} stroke={2.4} />
            </button>
          )}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="row" style={{ padding: '0 16px 10px', gap: 6 }}>
          {!locked && <button className="btn ghost sm" style={{ paddingLeft: 0 }} onClick={onAdd}>Add food</button>}
          {!locked && (
            <ActionButton size="sm" variant="ghost" state={copy.state} onClick={() => copy.run()} pendingLabel="Copying…" errorLabel="Nothing logged yesterday" doneLabel="Copied">
              Copy from yesterday
            </ActionButton>
          )}
          {locked && <span className="small faint">Nothing logged</span>}
        </div>
      ) : (
        <div className="list" style={{ paddingBottom: 4 }}>
          {entries.map((e) => (
            <button key={e.id} className="li" disabled={locked} onClick={() => !locked && onEdit(e)} style={{ padding: '8px 16px', cursor: locked ? 'default' : 'pointer' }}>
              <div className="main">
                <div className="name">{e.name}</div>
                <div className="sub">{e.source === 'quick' ? 'Quick add' : `${fmtNum(e.grams)} g`}{e.brand ? ` · ${e.brand}` : ''}</div>
              </div>
              <div className="end"><b>{fmtNum(e.n.kcal)}</b> <span className="small muted">kcal</span></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryEditor({ date, entry, onClose }: { date: string; entry: FoodEntry; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const [grams, setGrams] = useState<number | ''>(entry.grams);
  const per100 = scaleNutrients(entry.n, entry.grams ? (100 * 100) / entry.grams : 100);
  const n = entry.source === 'quick' ? entry.n : scaleNutrients(per100, Number(grams) || 0);
  const save = useAction(async () => {
    await replaceFoodEntry(uid, date, entry, { ...entry, grams: Number(grams) || 0, n });
    return true;
  });
  const del = useAction(async () => { await removeFoodEntry(uid, date, entry); return true; });
  return (
    <Modal title="Edit entry" onClose={onClose}>
      <div><h2>{entry.name}</h2>{entry.brand && <div className="small muted">{entry.brand}</div>}</div>
      {entry.source !== 'quick' && (
        <label className="f"><span>Amount</span><NumInput value={grams} onChange={setGrams} unit="g" autoFocus /></label>
      )}
      <NutrientSummary n={n} />
      <div className="row">
        <ActionButton variant="danger" state={del.state} pendingLabel="Removing…" onClick={async () => { if (await del.run()) { toast('Entry removed'); onClose(); } }}>
          Remove
        </ActionButton>
        <span className="grow" />
        {entry.source !== 'quick' && (
          <ActionButton variant="primary" state={save.state} pendingLabel="Saving…" onClick={async () => { if (await save.run()) { toast('Entry updated'); onClose(); } }}>
            Save
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
  return (
    <Panel title="Water" right={<span className="muted small"><b style={{ color: 'var(--fg)' }}>{fmtNum(shown)}</b> / {fmtNum(goal)} ml</span>}>
      <div className="col">
        <Meter value={shown} max={goal} color="var(--carbs)" />
        <div className="row">
          <button className="btn sm" onClick={() => change(-250)} disabled={shown <= 0}>− 250 ml</button>
          <button className="btn sm soft" onClick={() => change(250)}>+ 250 ml</button>
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
    toast('Weight logged');
  });
  return (
    <Panel title="Weight" right={w.data ? <span className="small"><b>{fmtNum(kgTo(units, w.data.kg), 1)}</b> {weightUnit(units)}</span> : <span className="small muted">Not logged</span>}>
      <div className="row">
        <div className="grow"><NumInput value={val} onChange={setVal} unit={weightUnit(units)} placeholder={w.data ? fmtNum(kgTo(units, w.data.kg), 1) : 'Weigh-in'} ariaLabel="Weight" /></div>
        <ActionButton state={save.state} onClick={() => save.run()} doneLabel="Saved">{w.data ? 'Update' : 'Log'}</ActionButton>
      </div>
      <ErrorLine>{save.error}</ErrorLine>
      <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>🔒 Private unless you share it from your profile.</p>
    </Panel>
  );
}

function CompletePanel({ date, day, totals, budget, onTarget }: { date: string; day: DiaryDay | null; totals: Nutrients; budget: number; onTarget: boolean }) {
  const { uid, settings } = useMe();
  const toast = useToast();
  const [share, setShare] = useState(true);
  const [note, setNote] = useState('');
  const [streak, setStreak] = useState<number | null>(null);
  const close = useAction(async () => {
    if (!day?.entries?.length) throw new Error('Log some food first');
    const r = await closeDay(uid, date, settings, day, { share, note: note.trim() });
    setStreak(r.streak);
    toast(r.onTarget ? `On target! Streak: ${r.streak} day${r.streak === 1 ? '' : 's'} 🔥` : 'Day completed', r.onTarget ? 'ok' : 'info');
  });
  const reopen = useAction(async () => { await reopenDay(uid, date); setStreak(null); });

  if (day?.closed) {
    return (
      <Panel title="Day completed" right={<span className={`pill pop ${day.onTarget ? 'ok' : 'warn'}`}>{day.onTarget ? '✓ On target' : 'Outside target'}</span>}>
        <div className="col">
          <p className="small muted" style={{ margin: 0 }}>
            {fmtNum(day.totals?.kcal ?? totals.kcal)} of {fmtNum(day.budget ?? budget)} kcal{streak != null ? ` · streak ${streak} day${streak === 1 ? '' : 's'}` : ''}.
            Reopen the day to make changes.
          </p>
          <div><ActionButton size="sm" state={reopen.state} onClick={() => reopen.run()} pendingLabel="Reopening…">Reopen day</ActionButton></div>
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="Complete day" right={<span className={`pill ${onTarget ? 'ok' : ''}`}>{onTarget ? 'On target' : 'Not on target yet'}</span>}>
      <div className="col">
        <p className="small muted" style={{ margin: 0 }}>
          A completed day counts toward your streak when calories land between {settings.bandLowerPct}% under and {settings.bandUpperPct}% over your target.
        </p>
        <Toggle on={share} onChange={setShare} label={<span>Share with friends <span className="small muted">(calories, macros and streak — not your foods)</span></span>} />
        {share && <EmojiField placeholder="Add a note (optional)" value={note} maxLength={200} onChange={setNote} />}
        <ErrorLine>{close.error}</ErrorLine>
        <ActionButton variant="primary" block state={close.state} onClick={() => close.run()} pendingLabel="Completing…" doneLabel="Completed">
          Mark day as complete
        </ActionButton>
      </div>
    </Panel>
  );
}
