import { useState } from 'react';
import type { ActivityLevel, GoalType, PrivateSettings, Sex, Units } from '../data/types';
import { ACTIVITY_FACTORS, bmr, macroGrams, suggestedCalories, tdee } from '../lib/nutrition';
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
  { l: 'BALANCED 30/40/30', p: { protein: 30, carbs: 40, fat: 30 } },
  { l: 'HIGH PROTEIN 40/30/30', p: { protein: 40, carbs: 30, fat: 30 } },
  { l: 'LOW CARB 35/20/45', p: { protein: 35, carbs: 20, fat: 45 } },
];

/** Controlled goals editor. `weightKg` is the latest/current weight used for calculations. */
export function GoalsForm({ s, onChange, weightKg }: { s: PrivateSettings; onChange: (s: PrivateSettings) => void; weightKg: number }) {
  const set = <K extends keyof PrivateSettings>(k: K, v: PrivateSettings[K]) => {
    const next = { ...s, [k]: v };
    if (next.calorieGoalAuto) next.calorieGoal = suggestedCalories(next, weightKg);
    onChange(next);
  };
  const u = s.units;
  const wu = weightUnit(u);
  const suggested = suggestedCalories(s, weightKg);
  const grams = macroGrams(s.calorieGoal, s.macroPct);
  const macroSum = s.macroPct.protein + s.macroPct.carbs + s.macroPct.fat;
  const rnd = (v: number) => Math.round(v * 10) / 10;

  return (
    <div className="col gap2">
      <div className="fgrid">
        <div className="f"><span className="flabel">Units</span>
          <Seg<Units> value={u} onChange={(v) => set('units', v)} options={[{ v: 'metric', l: 'KG / KM' }, { v: 'imperial', l: 'LB / MI' }]} />
        </div>
        <div className="f"><span className="flabel">Sex (for BMR)</span>
          <Seg<Sex> value={s.sex} onChange={(v) => set('sex', v)} options={[{ v: 'male', l: 'MALE' }, { v: 'female', l: 'FEMALE' }]} />
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
      <div className="fgrid">
        <div className="f"><span className="flabel">Goal</span>
          <Seg<GoalType> value={s.goalType} onChange={(v) => set('goalType', v)} options={[{ v: 'lose', l: 'LOSE' }, { v: 'maintain', l: 'MAINTAIN' }, { v: 'gain', l: 'GAIN' }]} />
        </div>
        {s.goalType !== 'maintain' && (
          <label className="f"><span>Rate per week</span>
            <select value={s.weeklyRateKg} onChange={(e) => set('weeklyRateKg', Number(e.target.value))}>
              {[0.25, 0.5, 0.75, 1].map((r) => <option key={r} value={r}>{fmtNum(kgTo(u, r), 2)} {wu} / week</option>)}
            </select>
          </label>
        )}
      </div>

      <table className="kv" style={{ border: '1px solid var(--line)' }}>
        <tbody>
          <tr><th>BMR (Mifflin–St Jeor)</th><td className="n">{fmtNum(bmr(s, weightKg))} kcal</td></tr>
          <tr><th>TDEE (maintenance)</th><td className="n">{fmtNum(tdee(s, weightKg))} kcal</td></tr>
          <tr><th>SUGGESTED GOAL</th><td className="n"><b>{fmtNum(suggested)} kcal</b></td></tr>
        </tbody>
      </table>

      <div className="col">
        <div className="row between wrap">
          <span className="flabel">Daily calorie goal</span>
          <Toggle on={s.calorieGoalAuto} onChange={(v) => { const n = { ...s, calorieGoalAuto: v }; if (v) n.calorieGoal = suggested; onChange(n); }} label="AUTO" />
        </div>
        <NumInput value={s.calorieGoal} onChange={(v) => v !== '' && onChange({ ...s, calorieGoal: Math.round(v), calorieGoalAuto: false })} unit="kcal" />
      </div>

      <div className="col">
        <span className="flabel">Macro split — {macroSum}% {macroSum !== 100 && <span className="bad">(must total 100)</span>}</span>
        <div className="row wrap" style={{ gap: 4 }}>
          {PRESETS.map((p) => (
            <button key={p.l} className={`btn sm ${JSON.stringify(p.p) === JSON.stringify(s.macroPct) ? 'on' : ''}`} onClick={() => onChange({ ...s, macroPct: p.p })}>{p.l}</button>
          ))}
        </div>
        <div className="fgrid">
          {(['protein', 'carbs', 'fat'] as const).map((k) => (
            <label key={k} className="f"><span>{k} · {grams[k]} g</span>
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
        <span className="flabel">"On target" band — a closed day counts toward your streak if calories land within</span>
        <div className="fgrid">
          <label className="f"><span>Under budget by up to</span><NumInput value={s.bandLowerPct} onChange={(v) => onChange({ ...s, bandLowerPct: Math.min(50, Number(v) || 0) })} unit="%" /></label>
          <label className="f"><span>Over budget by up to</span><NumInput value={s.bandUpperPct} onChange={(v) => onChange({ ...s, bandUpperPct: Math.min(50, Number(v) || 0) })} unit="%" /></label>
        </div>
        <div className="row wrap">
          <Toggle on={s.addExerciseCalories} onChange={(v) => onChange({ ...s, addExerciseCalories: v })} label="ADD EXERCISE KCAL TO BUDGET" />
        </div>
      </div>
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
