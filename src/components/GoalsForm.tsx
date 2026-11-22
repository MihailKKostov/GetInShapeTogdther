import { useState } from 'react';
import type { ActivityLevel, GoalType, PrivateSettings, Sex, Units } from '../data/types';
import {
  ACTIVITY_FACTORS, RATE_OPTIONS, bmr, goalEta, macroGrams, maxSafeLossRate, minDailyCalories, planRate,
  rawCalorieTarget, suggestedCalories, tdee, weeklyLossAt, type RatePlan,
} from '../lib/nutrition';
import { addDays, dateKey, daysBetween, parseKey } from '../lib/dates';
import { fmtNum, kgTo, toKg, weightUnit } from '../lib/units';
import { NumInput, Seg, Toggle } from './ui';

export const DEFAULT_SETTINGS: PrivateSettings = {
  email: '',
  units: 'metric',
  sex: 'male',
  birthYear: 1992,
  heightCm: 175,
  activityLevel: 'light',
  goalType: 'lose',
  weeklyRateKg: 0.5,
  targetDate: null,
  startWeightKg: 80,
  targetWeightKg: 74,
  calorieGoal: 2000,
  calorieGoalAuto: true,
  macroPct: { protein: 30, carbs: 40, fat: 30 },
  fiberGoal: 30,
  sodiumMaxMg: 2300,
  waterGoalMl: 2500,
  addExerciseCalories: true,
  bandLowerPct: 15,
  bandUpperPct: 5,
  setupComplete: false,
};

const PRESETS: { l: string; p: PrivateSettings['macroPct'] }[] = [
  { l: 'Balanced', p: { protein: 30, carbs: 40, fat: 30 } },
  { l: 'High protein', p: { protein: 40, carbs: 30, fat: 30 } },
  { l: 'Low carb', p: { protein: 35, carbs: 20, fat: 45 } },
];

/** Controlled goals editor. `weightKg` is the latest/current weight used for calculations. */
export function GoalsForm({ s, onChange, weightKg }: { s: PrivateSettings; onChange: (s: PrivateSettings) => void; weightKg: number }) {
  const set = <K extends keyof PrivateSettings>(k: K, v: PrivateSettings[K]) => {
    const next = { ...s, [k]: v };
    // With a target date, re-pick the closest rate whenever the date or target changes.
    if ((k === 'targetDate' || k === 'targetWeightKg' || k === 'goalType') && next.targetDate && next.goalType !== 'maintain') {
      const plan = planRate(weightKg, next.targetWeightKg, next.targetDate, dateKey());
      if (plan) {
        const safe = next.goalType === 'lose' ? maxSafeLossRate(next, weightKg) : null;
        next.weeklyRateKg = safe != null ? Math.min(plan.rate, safe) : next.goalType === 'lose' ? RATE_OPTIONS[0] : plan.rate;
      }
    }
    if (next.calorieGoalAuto) next.calorieGoal = suggestedCalories(next, weightKg);
    onChange(next);
  };
  const u = s.units;
  const wu = weightUnit(u);
  const suggested = suggestedCalories(s, weightKg);
  const grams = macroGrams(s.calorieGoal, s.macroPct);
  const macroSum = s.macroPct.protein + s.macroPct.carbs + s.macroPct.fat;
  const rnd = (v: number) => Math.round(v * 10) / 10;
  const plan = s.targetDate && s.goalType !== 'maintain' ? planRate(weightKg, s.targetWeightKg, s.targetDate, dateKey()) : null;

  return (
    <div className="col gap2">
      <div className="fgrid">
        <div className="f"><span className="flabel">Units</span>
          <Seg<Units> value={u} onChange={(v) => set('units', v)} options={[{ v: 'metric', l: 'kg / km' }, { v: 'imperial', l: 'lb / mi' }]} />
        </div>
        <div className="f"><span className="flabel">Sex (for calorie calculation)</span>
          <Seg<Sex> value={s.sex} onChange={(v) => set('sex', v)} options={[{ v: 'male', l: 'Male' }, { v: 'female', l: 'Female' }]} />
        </div>
      </div>
      <div className="fgrid">
        <label className="f"><span>Birth year</span><NumInput value={s.birthYear} onChange={(v) => v !== '' && set('birthYear', Math.round(v))} /></label>
        <HeightInput units={u} cm={s.heightCm} onChange={(cm) => set('heightCm', cm)} />
        <label className="f"><span>Start weight</span><NumInput value={rnd(kgTo(u, s.startWeightKg))} onChange={(v) => v !== '' && set('startWeightKg', toKg(u, v))} unit={wu} /></label>
        <label className="f"><span>Target weight</span><NumInput value={rnd(kgTo(u, s.targetWeightKg))} onChange={(v) => v !== '' && set('targetWeightKg', toKg(u, v))} unit={wu} /></label>
      </div>
      <label className="f"><span>Activity level (outside logged workouts)</span>
        <select value={s.activityLevel} onChange={(e) => set('activityLevel', e.target.value as ActivityLevel)}>
          {(Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map((k) => <option key={k} value={k}>{ACTIVITY_FACTORS[k].label}</option>)}
        </select>
      </label>
      <div className="col" style={{ gap: 5 }}>
        <span className="flabel">Goal</span>
        <Seg<GoalType> block value={s.goalType} onChange={(v) => set('goalType', v)} options={[{ v: 'lose', l: 'Lose weight' }, { v: 'maintain', l: 'Maintain' }, { v: 'gain', l: 'Gain weight' }]} />
      </div>
      <div className="fgrid">
        {s.goalType !== 'maintain' && (
          <label className="f"><span>Target date (optional)</span>
            <input type="date" value={s.targetDate ?? ''} min={addDays(dateKey(), 7)} onChange={(e) => set('targetDate', e.target.value || null)} />
            {s.targetDate && <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => set('targetDate', null)}>Clear date</button>}
          </label>
        )}
        {s.goalType !== 'maintain' && (
          <label className="f"><span>Rate per week</span>
            <select value={s.weeklyRateKg} onChange={(e) => set('weeklyRateKg', Number(e.target.value))}>
              {RATE_OPTIONS.map((r) => <option key={r} value={r}>{fmtNum(kgTo(u, r), 2)} {wu}/week{plan?.rate === r ? ' ✓' : ''}</option>)}
            </select>
          </label>
        )}
      </div>
      {s.goalType === 'lose' && s.calorieGoalAuto && <PaceFloorWarning s={s} weightKg={weightKg} onPick={(r) => set('weeklyRateKg', r)} />}
      {s.goalType !== 'maintain' && <RatePlanNote s={s} weightKg={weightKg} plan={plan} />}

      <div className="stats c3">
        <div className="stat"><div className="k">Resting (BMR)</div><div className="v">{fmtNum(bmr(s, weightKg))}<small> kcal</small></div></div>
        <div className="stat"><div className="k">Maintenance</div><div className="v">{fmtNum(tdee(s, weightKg))}<small> kcal</small></div></div>
        <div className="stat" style={{ background: 'var(--primary-soft)' }}><div className="k">Suggested</div><div className="v accent">{fmtNum(suggested)}<small> kcal</small></div></div>
      </div>

      <div className="col">
        <div className="row between wrap">
          <span className="flabel">Daily calorie goal</span>
          <Toggle on={s.calorieGoalAuto} onChange={(v) => { const n = { ...s, calorieGoalAuto: v }; if (v) n.calorieGoal = suggested; onChange(n); }} label="Use suggested" />
        </div>
        <NumInput value={s.calorieGoal} onChange={(v) => v !== '' && onChange({ ...s, calorieGoal: Math.round(v), calorieGoalAuto: false })} unit="kcal" />
        {!s.calorieGoalAuto && s.calorieGoal < minDailyCalories(s.sex) && (
          <div className="warn-box">
            ⚠️ {fmtNum(s.calorieGoal)} kcal/day is below the recommended minimum of <b>{fmtNum(minDailyCalories(s.sex))} kcal/day</b> for {s.sex === 'male' ? 'men' : 'women'}.
            Eating this little without medical supervision isn't recommended.
          </div>
        )}
      </div>

      <div className="col">
        <span className="flabel">Macro split {macroSum !== 100 && <span className="bad">(must add up to 100%, now {macroSum}%)</span>}</span>
        <div className="row wrap" style={{ gap: 4 }}>
          {PRESETS.map((p) => (
            <button key={p.l} className={`btn sm ${JSON.stringify(p.p) === JSON.stringify(s.macroPct) ? 'on' : ''}`} onClick={() => onChange({ ...s, macroPct: p.p })}>{p.l}</button>
          ))}
        </div>
        <div className="fgrid">
          {(['protein', 'carbs', 'fat'] as const).map((k) => (
            <label key={k} className="f"><span>{k[0].toUpperCase() + k.slice(1)} · {grams[k]} g</span>
              <NumInput value={s.macroPct[k]} onChange={(v) => onChange({ ...s, macroPct: { ...s.macroPct, [k]: Number(v) || 0 } })} unit="%" />
            </label>
          ))}
        </div>
      </div>

      <div className="fgrid">
        <label className="f"><span>Fiber goal</span><NumInput value={s.fiberGoal} onChange={(v) => onChange({ ...s, fiberGoal: Number(v) || 0 })} unit="g" /></label>
        <label className="f"><span>Sodium max</span><NumInput value={s.sodiumMaxMg} onChange={(v) => onChange({ ...s, sodiumMaxMg: Number(v) || 0 })} unit="mg" /></label>
        <label className="f"><span>Water goal</span><NumInput value={s.waterGoalMl} onChange={(v) => onChange({ ...s, waterGoalMl: Number(v) || 0 })} unit="ml" /></label>
      </div>

      <div className="col">
        <span className="flabel">A completed day counts as on target when calories are within:</span>
        <div className="fgrid">
          <label className="f"><span>Under budget by up to</span><NumInput value={s.bandLowerPct} onChange={(v) => onChange({ ...s, bandLowerPct: Math.min(50, Number(v) || 0) })} unit="%" /></label>
          <label className="f"><span>Over budget by up to</span><NumInput value={s.bandUpperPct} onChange={(v) => onChange({ ...s, bandUpperPct: Math.min(50, Number(v) || 0) })} unit="%" /></label>
        </div>
        <div className="row wrap">
          <Toggle on={s.addExerciseCalories} onChange={(v) => onChange({ ...s, addExerciseCalories: v })} label="Add exercise calories to my daily target" />
        </div>
      </div>
    </div>
  );
}

/** Warns when the chosen loss pace would need fewer calories than the recommended daily minimum. */
function PaceFloorWarning({ s, weightKg, onPick }: { s: PrivateSettings; weightKg: number; onPick: (rate: number) => void }) {
  const floor = minDailyCalories(s.sex);
  const raw = rawCalorieTarget(s, weightKg);
  if (raw >= floor) return null;
  const u = s.units;
  const r = (kg: number) => `${fmtNum(kgTo(u, kg), 2)} ${weightUnit(u)}/week`;
  const safe = maxSafeLossRate(s, weightKg);
  const actual = Math.max(0, weeklyLossAt(s, weightKg, floor));
  return (
    <div className="warn-box">
      <div>
        ⚠️ At {r(s.weeklyRateKg)} your target would be <b>{fmtNum(Math.round(raw / 10) * 10)} kcal/day</b>, below the recommended
        minimum of <b>{fmtNum(floor)} kcal/day</b> for {s.sex === 'male' ? 'men' : 'women'}. Your target is kept at {fmtNum(floor)} kcal,
        so you'd lose about {r(actual)} instead.
      </div>
      {safe != null ? (
        <div className="row wrap" style={{ marginTop: 8 }}>
          <span>{r(safe)} is the fastest pace that stays above the minimum.</span>
          <button type="button" className="btn sm" onClick={() => onPick(safe)}>Use {r(safe)}</button>
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          Even the slowest pace goes below it. Logged workouts add to your daily budget, or consider talking to a doctor or dietitian about a plan.
        </div>
      )}
    </div>
  );
}

/** Explains the suggested rate and when the target will be reached at the chosen rate. */
function RatePlanNote({ s, weightKg, plan }: { s: PrivateSettings; weightKg: number; plan: RatePlan | null }) {
  const u = s.units;
  const wu = weightUnit(u);
  const today = dateKey();
  const diff = s.targetWeightKg - weightKg;
  const w = (kg: number) => `${fmtNum(kgTo(u, kg), 1)} ${wu}`;
  const r = (kg: number) => `${fmtNum(kgTo(u, kg), 2)} ${wu}/week`;
  const dateLabel = (k: string) => parseKey(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  if (Math.abs(diff) < 0.1) {
    return <div className="small muted">You're already at your target weight.</div>;
  }
  const wrongWay = (s.goalType === 'lose' && diff > 0) || (s.goalType === 'gain' && diff < 0);
  if (wrongWay) {
    return (
      <div className="small warn">
        Your target ({w(s.targetWeightKg)}) is {diff > 0 ? 'above' : 'below'} your current weight ({w(weightKg)}).
        Switch the goal to <b>{diff > 0 ? 'Gain' : 'Lose'}</b> or adjust the target.
      </div>
    );
  }

  // Pace you'd actually see at your calorie goal (it can differ when the goal is held at the minimum or set by hand).
  const actual = (s.goalType === 'lose' ? 1 : -1) * weeklyLossAt(s, weightKg, s.calorieGoal);
  const pace = Math.abs(actual - s.weeklyRateKg) < 0.03 ? s.weeklyRateKg : actual;
  if (pace <= 0.02) {
    return <div className="warn-box">At {fmtNum(s.calorieGoal)} kcal/day you won't move toward your target. {s.goalType === 'lose' ? 'Lower' : 'Raise'} your calorie goal or turn on "Use suggested".</div>;
  }
  const eta = goalEta(weightKg, s.targetWeightKg, pace, today);
  const weeks = eta ? Math.round(daysBetween(today, eta) / 7) : 0;
  const offset = eta && s.targetDate ? Math.round(daysBetween(s.targetDate, eta) / 7) : 0;

  return (
    <div className="summary" style={{ gap: 6 }}>
      {plan && (
        <div className="small">
          To reach {w(s.targetWeightKg)} by <b>{dateLabel(s.targetDate!)}</b> you'd need about <b>{r(plan.requiredKgPerWeek)}</b>.{' '}
          {plan.tooFast
            ? <span className="warn">That's faster than the recommended maximum of {r(plan.rate)}.</span>
            : <>Closest option: <b>{r(plan.rate)}</b>.</>}
          {s.goalType === 'lose' && s.weeklyRateKg < plan.rate && <> We suggest {r(s.weeklyRateKg)} to keep you above the daily calorie minimum.</>}
        </div>
      )}
      {eta && (
        <div className="small">
          At {pace === s.weeklyRateKg ? r(pace) : `about ${r(pace)}`} you'll reach your target around <b>{dateLabel(eta)}</b> ({weeks} week{weeks === 1 ? '' : 's'})
          {s.targetDate && (
            offset === 0 ? <span className="ok"> — right on time.</span>
              : offset > 0 ? <span className="muted"> — {offset} week{offset === 1 ? '' : 's'} after your target date.</span>
                : <span className="ok"> — {-offset} week{offset === -1 ? '' : 's'} early.</span>
          )}
          {!s.targetDate && '.'}
        </div>
      )}
    </div>
  );
}

function HeightInput({ units, cm, onChange }: { units: Units; cm: number; onChange: (cm: number) => void }) {
  const totalIn = Math.round(cm / 2.54);
  const [ft, setFt] = useState<number | ''>(Math.floor(totalIn / 12));
  const [inch, setInch] = useState<number | ''>(totalIn % 12);
  if (units === 'metric') {
    return <label className="f"><span>Height</span><NumInput value={Math.round(cm)} onChange={(v) => v !== '' && onChange(v)} unit="cm" /></label>;
  }
  const upd = (f: number | '', i: number | '') => { setFt(f); setInch(i); onChange(((Number(f) || 0) * 12 + (Number(i) || 0)) * 2.54); };
  return (
    <div className="f"><span className="flabel">Height</span>
      <div className="row" style={{ gap: 4 }}>
        <NumInput value={ft} onChange={(v) => upd(v, inch)} unit="ft" />
        <NumInput value={inch} onChange={(v) => upd(ft, v)} unit="in" />
      </div>
    </div>
  );
}
