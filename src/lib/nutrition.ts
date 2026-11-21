import type {
  ActivityLevel, ActivityType, DiaryDay, Nutrients, PrivateSettings,
} from '../data/types';

export const ACTIVITY_FACTORS: Record<ActivityLevel, { f: number; label: string }> = {
  sedentary: { f: 1.2, label: 'Sedentary — desk job, little exercise' },
  light: { f: 1.375, label: 'Light — exercise 1–3 days/week' },
  moderate: { f: 1.55, label: 'Moderate — exercise 3–5 days/week' },
  active: { f: 1.725, label: 'Active — hard exercise 6–7 days/week' },
  very_active: { f: 1.9, label: 'Very active — physical job + training' },
};

/** Mifflin–St Jeor */
export function bmr(s: Pick<PrivateSettings, 'sex' | 'birthYear' | 'heightCm'>, weightKg: number): number {
  const age = new Date().getFullYear() - s.birthYear;
  const base = 10 * weightKg + 6.25 * s.heightCm - 5 * age;
  return s.sex === 'male' ? base + 5 : base - 161;
}

export function tdee(s: PrivateSettings, weightKg: number): number {
  return bmr(s, weightKg) * ACTIVITY_FACTORS[s.activityLevel].f;
}

/** ~7700 kcal per kg of body weight. */
export function suggestedCalories(s: PrivateSettings, weightKg: number): number {
  const t = tdee(s, weightKg);
  const daily = (s.weeklyRateKg * 7700) / 7;
  let goal = s.goalType === 'lose' ? t - daily : s.goalType === 'gain' ? t + daily : t;
  const floor = s.sex === 'male' ? 1500 : 1200;
  goal = Math.max(floor, goal);
  return Math.round(goal / 10) * 10;
}

export function macroGrams(kcal: number, pct: PrivateSettings['macroPct']) {
  return {
    protein: Math.round((kcal * pct.protein) / 100 / 4),
    carbs: Math.round((kcal * pct.carbs) / 100 / 4),
    fat: Math.round((kcal * pct.fat) / 100 / 9),
  };
}

export function emptyNutrients(): Nutrients {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, sodiumMg: 0 };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: (a.fiber ?? 0) + (b.fiber ?? 0),
    sugar: (a.sugar ?? 0) + (b.sugar ?? 0),
    satFat: (a.satFat ?? 0) + (b.satFat ?? 0),
    sodiumMg: (a.sodiumMg ?? 0) + (b.sodiumMg ?? 0),
  };
}

export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  const r = (v: number | undefined, d = 1) =>
    v == null ? undefined : Math.round(v * k * 10 ** d) / 10 ** d;
  return {
    kcal: Math.round(per100.kcal * k),
    protein: r(per100.protein)!,
    carbs: r(per100.carbs)!,
    fat: r(per100.fat)!,
    fiber: r(per100.fiber),
    sugar: r(per100.sugar),
    satFat: r(per100.satFat),
    sodiumMg: per100.sodiumMg == null ? undefined : Math.round(per100.sodiumMg * k),
  };
}

export function dayTotals(day: Pick<DiaryDay, 'entries'> | undefined): Nutrients {
  return (day?.entries ?? []).reduce((acc, e) => addNutrients(acc, e.n), emptyNutrients());
}

export function dayBudget(s: PrivateSettings, day: Pick<DiaryDay, 'exerciseKcal'> | undefined): number {
  return s.calorieGoal + (s.addExerciseCalories ? Math.round(day?.exerciseKcal ?? 0) : 0);
}

export function isOnTarget(s: PrivateSettings, kcal: number, budget: number): boolean {
  const lo = budget * (1 - s.bandLowerPct / 100);
  const hi = budget * (1 + s.bandUpperPct / 100);
  return kcal >= lo && kcal <= hi;
}

/** MET values (Compendium of Physical Activities, rounded). */
export const ACTIVITY_TYPES: Record<ActivityType, { label: string; met: number; distance: boolean; glyph: string }> = {
  run: { label: 'Run', met: 9.8, distance: true, glyph: 'RUN' },
  ride: { label: 'Ride', met: 7.5, distance: true, glyph: 'RDE' },
  walk: { label: 'Walk', met: 3.5, distance: true, glyph: 'WLK' },
  hike: { label: 'Hike', met: 6.0, distance: true, glyph: 'HKE' },
  swim: { label: 'Swim', met: 7.0, distance: true, glyph: 'SWM' },
  row: { label: 'Row', met: 7.0, distance: true, glyph: 'ROW' },
  strength: { label: 'Strength', met: 5.0, distance: false, glyph: 'STR' },
  hiit: { label: 'HIIT', met: 8.0, distance: false, glyph: 'HIT' },
  yoga: { label: 'Yoga / Mobility', met: 2.8, distance: false, glyph: 'YGA' },
  sport: { label: 'Sport', met: 7.0, distance: false, glyph: 'SPT' },
  other: { label: 'Other', met: 4.5, distance: false, glyph: 'OTH' },
};

export function estimateKcal(type: ActivityType, durationSec: number, weightKg: number, distanceM = 0): number {
  let met = ACTIVITY_TYPES[type].met;
  // Scale running/riding MET by speed when distance is known.
  if (distanceM > 0 && durationSec > 0) {
    const kmh = distanceM / 1000 / (durationSec / 3600);
    if (type === 'run') met = Math.min(16, Math.max(6, kmh * 1.0));
    if (type === 'ride') met = Math.min(14, Math.max(4, kmh * 0.35));
    if (type === 'walk') met = Math.min(5, Math.max(2.5, kmh * 0.7));
  }
  return Math.round(met * weightKg * (durationSec / 3600));
}

export const NUTRIENT_LABELS: Record<keyof Nutrients, { label: string; unit: string }> = {
  kcal: { label: 'Energy', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  carbs: { label: 'Carbs', unit: 'g' },
  fat: { label: 'Fat', unit: 'g' },
  fiber: { label: 'Fiber', unit: 'g' },
  sugar: { label: 'Sugars', unit: 'g' },
  satFat: { label: 'Sat. fat', unit: 'g' },
  sodiumMg: { label: 'Sodium', unit: 'mg' },
};
