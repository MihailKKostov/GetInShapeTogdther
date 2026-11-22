// Logs planned recipe meals to the food diary once their meal time has passed, when
// "Auto-log planned meals" is on. Runs while the app is open (on start and every few minutes),
// catching up on the last 7 days, so nothing is missed if the app wasn't opened at mealtime.
import { useEffect, useRef } from 'react';
import { doc, getDoc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { diaryRef } from '../../data/api';
import { logRecipe, mealPlanCol, recipesCol } from '../../data/recipes';
import type { DiaryDay, Meal, PlannedMeal, Recipe } from '../../data/types';
import { useToast } from '../../components/ui';
import { useSession } from '../../hooks/useSession';
import { addDays, dateKey } from '../../lib/dates';

/** Hour after which a planned meal counts as eaten. */
export const MEAL_DUE_HOUR: Record<Meal, number> = { breakfast: 10, lunch: 14, snacks: 17, dinner: 20 };

export function isDue(m: Pick<PlannedMeal, 'date' | 'meal'>, now = new Date()): boolean {
  const today = dateKey(now);
  if (m.date < today) return true;
  return m.date === today && now.getHours() >= MEAL_DUE_HOUR[m.meal];
}

export async function autoLogDue(uid: string, now = new Date()): Promise<number> {
  const today = dateKey(now);
  const snap = await getDocs(query(mealPlanCol(uid), where('date', '>=', addDays(today, -7)), where('date', '<=', today)));
  const due = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlannedMeal)).filter((m) => m.recipeId && !m.loggedEntryId && isDue(m, now));
  let logged = 0;
  const closed = new Map<string, boolean>();
  for (const m of due) {
    if (!closed.has(m.date)) closed.set(m.date, !!((await getDoc(diaryRef(uid, m.date))).data() as DiaryDay | undefined)?.closed);
    if (closed.get(m.date)) continue; // don't change days the user already completed
    const rs = await getDoc(doc(recipesCol(uid), m.recipeId!));
    const r = rs.exists() ? ({ id: rs.id, ...rs.data() } as Recipe) : null;
    if (!r?.perServing) continue;
    const entryId = `auto-${m.id}`;
    // Claim the meal in a transaction so two open devices can't both log it.
    const claimed = await runTransaction(db, async (tx) => {
      const ref = doc(mealPlanCol(uid), m.id);
      const cur = await tx.get(ref);
      if (!cur.exists() || cur.data().loggedEntryId) return false;
      tx.update(ref, { loggedEntryId: entryId });
      return true;
    }).catch(() => false);
    if (!claimed) continue;
    logRecipe(uid, r, m.date, m.meal, m.servings || 1, entryId);
    logged++;
  }
  return logged;
}

export function AutoLogger() {
  const { user, settings } = useSession();
  const toast = useToast();
  const running = useRef(false);
  const on = !!settings?.autoLogPlannedMeals;
  const uid = user?.uid;
  useEffect(() => {
    if (!on || !uid) return;
    const run = async () => {
      if (running.current || !navigator.onLine) return;
      running.current = true;
      try {
        const n = await autoLogDue(uid);
        if (n) toast(`Logged ${n} planned meal${n === 1 ? '' : 's'} to your diary`);
      } catch (e) {
        console.warn('auto-log failed', e);
      } finally { running.current = false; }
    };
    const t = setTimeout(run, 2000);
    const i = setInterval(run, 5 * 60 * 1000);
    const vis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', vis);
    return () => { clearTimeout(t); clearInterval(i); document.removeEventListener('visibilitychange', vis); };
  }, [on, uid, toast]);
  return null;
}
