// Weekly meal planner (RecipeMan: PlannerScreen) with diary logging.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { saveSettings } from '../../data/api';
import {
  addLinesToGroceryList, addMenuToPlan, addPlannedMeal, createGroceryList, deletePlannedMeal, logPlannedMeal, MEAL_LABELS,
  updatePlannedMeal,
} from '../../data/recipes';
import { MEALS, type Meal, type PlannedMeal, type Recipe } from '../../data/types';
import { Icon, Modal, NumInput, Panel, Seg, Skeleton, Toggle, useToast } from '../../components/ui';
import { useMe } from '../../hooks/useSession';
import { addDays, dateKey, parseKey } from '../../lib/dates';
import { ingredientLines, isHeader } from '../../lib/recipes/ingredients';
import { inPantry } from '../../lib/recipes/pantry';
import { fmtNum } from '../../lib/units';
import { weekStart } from '../Activities';
import { RecipesNav } from './bits';
import { useGroceryItems, useGroceryLists, useMealPlan, useMenus, usePantry, useRecipes } from './data';
import { RecipePickerModal } from './dialogs';

export default function Plan() {
  const { uid, settings } = useMe();
  const toast = useToast();
  const [start, setStart] = useState(() => weekStart(dateKey()));
  const end = addDays(start, 6);
  const plan = useMealPlan(uid, start, end);
  const recipes = useRecipes(uid);
  const lists = useGroceryLists(uid);
  const items = useGroceryItems(uid);
  const pantry = usePantry(uid);
  const menus = useMenus(uid);
  const byId = useMemo(() => new Map(recipes.data.map((r) => [r.id, r])), [recipes.data]);
  const [adding, setAdding] = useState<{ date: string; meal: Meal } | null>(null);
  const [editing, setEditing] = useState<PlannedMeal | null>(null);
  const [menuDialog, setMenuDialog] = useState(false);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = dateKey();

  const toGrocery = () => {
    const listId = lists.data[0]?.id ?? createGroceryList(uid, 'Groceries');
    // Each planned recipe once per time it's planned; items already in the pantry are skipped (like RecipeMan).
    const entries = plan.data.flatMap((m) => {
      const r = m.recipeId ? byId.get(m.recipeId) : undefined;
      return r ? ingredientLines(r.ingredients).filter((l) => !isHeader(l) && !inPantry(l, pantry.data)).map((line) => ({ line, recipeName: r.name })) : [];
    });
    const n = addLinesToGroceryList(uid, listId, entries, items.data);
    toast(n ? `Added ${n} ingredient${n === 1 ? '' : 's'} to your grocery list` : 'No recipe ingredients to add (pantry items are skipped)');
  };

  const setAutoLog = (v: boolean) => {
    saveSettings(uid, { ...settings, autoLogPlannedMeals: v });
    toast(v ? 'Planned meals will be logged automatically' : 'Auto-logging turned off');
  };

  return (
    <div className="page">
      <RecipesNav />
      <div className="daynav">
        <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week"><Icon name="left" /></button>
        <div className="mid">
          <b>{start === weekStart(today) ? 'This week' : `Week of ${parseKey(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</b>
          <span>{parseKey(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {parseKey(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
        <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Next week"><Icon name="right" /></button>
      </div>

      <Panel>
        <div className="col">
          <Toggle on={!!settings.autoLogPlannedMeals} onChange={setAutoLog} label={<span><b>Auto-log planned meals</b><br /><span className="small muted">Recipes in your plan are added to your food diary once their meal time passes (breakfast 10:00, lunch 14:00, snack 17:00, dinner 20:00).</span></span>} />
          <div className="row wrap">
            <button className="btn sm" onClick={toGrocery} disabled={!plan.data.some((m) => m.recipeId)}>🛒 Week's ingredients → groceries</button>
            <button className="btn sm" onClick={() => setMenuDialog(true)} disabled={!menus.data.length}>📋 Add a menu</button>
          </div>
        </div>
      </Panel>

      {plan.loading ? <Skeleton h={300} /> : days.map((d) => {
        const meals = plan.data.filter((m) => m.date === d);
        const kcal = meals.reduce((s, m) => s + ((m.recipeId && byId.get(m.recipeId)?.perServing?.kcal) || 0) * (m.servings || 1), 0);
        return (
          <section key={d} className="panel" style={d === today ? { borderColor: 'var(--primary)' } : undefined}>
            <div className="panel-h">
              <span className="t">{d === today ? 'Today' : parseKey(d).toLocaleDateString(undefined, { weekday: 'long' })}</span>
              <span className="small muted">{parseKey(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className="sp" />
              {kcal > 0 && <span className="small muted">{fmtNum(kcal)} kcal</span>}
            </div>
            <div className="panel-b tight list">
              {MEALS.flatMap((meal) => meals.filter((m) => m.meal === meal)).map((m) => (
                <div key={m.id} className="li" style={{ alignItems: 'flex-start' }}>
                  <span className="small muted" style={{ width: 62, flex: 'none', paddingTop: 2 }}>{MEAL_LABELS[m.meal]}</span>
                  <div className="main"><PlannedRow m={m} r={m.recipeId ? byId.get(m.recipeId) : undefined} onEdit={() => setEditing(m)} /></div>
                </div>
              ))}
              <div className="li" style={{ gap: 4, flexWrap: 'wrap' }}>
                {MEALS.map((meal) => <button key={meal} className="chip" onClick={() => setAdding({ date: d, meal })}>+ {MEAL_LABELS[meal]}</button>)}
              </div>
            </div>
          </section>
        );
      })}

      {adding && (
        <RecipePickerModal
          title={`${MEAL_LABELS[adding.meal]} · ${parseKey(adding.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`}
          onClose={() => setAdding(null)}
          onPick={(p) => { addPlannedMeal(uid, { ...adding, ...p, servings: 1 }); setAdding(null); }}
        />
      )}
      {editing && <EditPlanned m={editing} r={editing.recipeId ? byId.get(editing.recipeId) : undefined} onClose={() => setEditing(null)} />}
      {menuDialog && <ApplyMenu start={start} onClose={() => setMenuDialog(false)} />}
    </div>
  );
}

function PlannedRow({ m, r, onEdit }: { m: PlannedMeal; r: Recipe | undefined; onEdit: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const canLog = !!r?.perServing && !m.loggedEntryId;
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="grow" onClick={onEdit} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', minWidth: 0 }}>
        <div className="trunc"><b style={{ fontWeight: 500 }}>{m.name || r?.name || 'Recipe'}</b>{m.servings && m.servings !== 1 ? <span className="muted"> ×{m.servings}</span> : null}</div>
        {r?.perServing && <div className="small muted">{fmtNum(r.perServing.kcal * (m.servings || 1))} kcal</div>}
        {m.recipeId && !r && <div className="small muted">recipe deleted</div>}
      </button>
      {m.loggedEntryId ? <span className="pill ok">✓ Logged</span>
        : canLog ? <button className="btn sm soft" onClick={() => { logPlannedMeal(uid, m, r!); toast(`${r!.name} logged to your diary`); }}>Log</button>
          : null}
    </div>
  );
}

function EditPlanned({ m, r, onClose }: { m: PlannedMeal; r: Recipe | undefined; onClose: () => void }) {
  const { uid } = useMe();
  const [servings, setServings] = useState<number | ''>(m.servings || 1);
  const [meal, setMeal] = useState<Meal>(m.meal);
  const [date, setDate] = useState(m.date);
  return (
    <Modal title={m.name || r?.name || 'Planned meal'} onClose={onClose}>
      {r && <Link to={`/recipes/${r.id}`} onClick={onClose}>Open recipe →</Link>}
      <div className="fgrid">
        <label className="f"><span>Day</span><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        {m.recipeId && <label className="f"><span>Servings</span><NumInput value={servings} onChange={setServings} unit="×" /></label>}
      </div>
      <Seg<Meal> block value={meal} onChange={setMeal} options={MEALS.map((x) => ({ v: x, l: MEAL_LABELS[x] }))} />
      {m.loggedEntryId && <p className="small muted" style={{ margin: 0 }}>Already logged to your diary. Changes here don't change the diary entry.</p>}
      <div className="row">
        <button className="btn danger" onClick={() => { deletePlannedMeal(uid, m.id); onClose(); }}>Remove</button>
        <span className="grow" />
        <button className="btn primary" onClick={() => { updatePlannedMeal(uid, m.id, { servings: Number(servings) || 1, meal, date }); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}

function ApplyMenu({ start, onClose }: { start: string; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const menus = useMenus(uid);
  const [id, setId] = useState('');
  const [from, setFrom] = useState(start);
  const menu = menus.data.find((x) => x.id === (id || menus.data[0]?.id));
  return (
    <Modal title="Add a menu to the plan" onClose={onClose}>
      <select value={menu?.id ?? ''} onChange={(e) => setId(e.target.value)} aria-label="Menu">
        {menus.data.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.items.length} meals)</option>)}
      </select>
      <label className="f"><span>Starting on</span><input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
      <button className="btn primary" disabled={!menu} onClick={() => { addMenuToPlan(uid, menu!, from, addDays); toast(`Added "${menu!.name}" to your plan`); onClose(); }}>Add to plan</button>
    </Modal>
  );
}
