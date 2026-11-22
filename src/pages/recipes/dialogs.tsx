// Dialogs for acting on a recipe: log to diary, add to meal plan, add to groceries, share, pick.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addPlannedMeal, addToGroceryList, createGroceryList, logRecipe, MEAL_LABELS, mealForNow, shareRecipe, updateRecipe,
} from '../../data/recipes';
import { MEALS, type Meal, type Recipe, type RecipeSnapshot } from '../../data/types';
import { EmojiField } from '../../components/EmojiText';
import { useAiSettings } from '../../components/PhotoTab';
import { ActionButton, ErrorLine, Modal, NumInput, Seg, Spinner, useToast } from '../../components/ui';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useSession';
import { dateKey } from '../../lib/dates';
import { estimateRecipeNutrition } from '../../lib/recipes/aiNutrition';
import { ingredientLines, isHeader, transformIngredient } from '../../lib/recipes/ingredients';
import { inPantry } from '../../lib/recipes/pantry';
import { fmtNum } from '../../lib/units';
import { RecipeImage } from './bits';
import { useGroceryItems, useGroceryLists, usePantry, useRecipes } from './data';

const mealOptions = MEALS.map((m) => ({ v: m, l: MEAL_LABELS[m] }));

/** "Estimate with AI" for recipes without nutrition. Saves the result on the recipe. */
export function EstimateNutritionButton({ recipe, onDone }: { recipe: Recipe; onDone?: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const { key, model } = useAiSettings();
  const est = useAction(async () => {
    const perServing = await estimateRecipeNutrition(recipe, { key, model });
    updateRecipe(uid, recipe.id, { perServing, perServingSource: 'ai' });
    toast(`Estimated ${fmtNum(perServing.kcal)} kcal per serving`);
    onDone?.();
  });
  if (!key) return <Link className="btn sm" to="/settings#ai">Set up AI estimates</Link>;
  return (
    <>
      <ActionButton size="sm" variant="soft" state={est.state} pendingLabel="Estimating…" onClick={() => est.run()}>✨ Estimate with AI</ActionButton>
      {est.error && <ErrorLine>{est.error}</ErrorLine>}
    </>
  );
}

export function LogRecipeModal({ recipe, onClose, initialServings = 1 }: { recipe: Recipe; onClose: () => void; initialServings?: number }) {
  const { uid } = useMe();
  const toast = useToast();
  const [date, setDate] = useState(dateKey());
  const [meal, setMeal] = useState<Meal>(mealForNow());
  const [servings, setServings] = useState<number | ''>(initialServings);
  const n = recipe.perServing;
  const log = () => {
    if (!n || !servings) return;
    logRecipe(uid, recipe, date, meal, Number(servings));
    toast(`${recipe.name} → ${MEAL_LABELS[meal].toLowerCase()} · ${fmtNum(n.kcal * Number(servings))} kcal`);
    onClose();
  };
  return (
    <Modal title="Log to food diary" onClose={onClose}>
      <b>{recipe.name}</b>
      {!n ? (
        <div className="col">
          <div className="warn-box">This recipe has no nutrition per serving yet, so it can't be logged.</div>
          <div className="row wrap">
            <EstimateNutritionButton recipe={recipe} />
            <Link className="btn sm" to={`/recipes/${recipe.id}/edit`} onClick={onClose}>Enter it manually</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="fgrid">
            <label className="f"><span>Day</span><input type="date" value={date} max={dateKey()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
            <label className="f"><span>Servings</span><NumInput value={servings} onChange={setServings} unit="×" /></label>
          </div>
          <Seg<Meal> block value={meal} onChange={setMeal} options={mealOptions} />
          <div className="summary-nums">
            <div><b>{fmtNum(n.kcal * (Number(servings) || 0))}</b><span>kcal</span></div>
            <div><b>{fmtNum(n.protein * (Number(servings) || 0))} g</b><span>protein</span></div>
            <div><b>{fmtNum(n.carbs * (Number(servings) || 0))} g</b><span>carbs</span></div>
            <div><b>{fmtNum(n.fat * (Number(servings) || 0))} g</b><span>fat</span></div>
          </div>
          <button className="btn primary" onClick={log} disabled={!servings}>Log {servings || 0} serving{servings === 1 ? '' : 's'}</button>
        </>
      )}
    </Modal>
  );
}

export function PlanModal({ recipe, onClose }: { recipe: Pick<Recipe, 'id' | 'name'>; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const [date, setDate] = useState(dateKey());
  const [meal, setMeal] = useState<Meal>('dinner');
  const [servings, setServings] = useState<number | ''>(1);
  return (
    <Modal title="Add to meal plan" onClose={onClose}>
      <b>{recipe.name}</b>
      <div className="fgrid">
        <label className="f"><span>Day</span><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <label className="f"><span>Servings you'll eat</span><NumInput value={servings} onChange={setServings} unit="×" /></label>
      </div>
      <Seg<Meal> block value={meal} onChange={setMeal} options={mealOptions} />
      <button className="btn primary" onClick={() => {
        addPlannedMeal(uid, { date, meal, recipeId: recipe.id, name: recipe.name, servings: Number(servings) || 1 });
        toast(`Planned for ${MEAL_LABELS[meal].toLowerCase()}`);
        onClose();
      }}>Add to plan</button>
    </Modal>
  );
}

export function GroceryModal({ recipe, factor = 1, onClose }: { recipe: RecipeSnapshot; factor?: number; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const lists = useGroceryLists(uid);
  const items = useGroceryItems(uid);
  const pantry = usePantry(uid);
  const lines = useMemo(() => ingredientLines(recipe.ingredients).filter((l) => !isHeader(l)).map((l) => transformIngredient(l, factor)), [recipe.ingredients, factor]);
  // Like RecipeMan: items you already have in the pantry start unticked.
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const sel = selected ?? new Set(lines.map((_, i) => i).filter((i) => !inPantry(lines[i], pantry.data)));
  const [listId, setListId] = useState<string>('');
  const target = listId || lists.data[0]?.id || '';
  const add = () => {
    const id = target || createGroceryList(uid, 'Groceries');
    const n = addToGroceryList(uid, id, lines.filter((_, i) => sel.has(i)), recipe.name, items.data);
    toast(`Added ${n} item${n === 1 ? '' : 's'} to your grocery list`);
    onClose();
  };
  return (
    <Modal title="Add to grocery list" onClose={onClose}>
      {lists.data.length > 1 && (
        <select value={target} onChange={(e) => setListId(e.target.value)} aria-label="Grocery list">
          {lists.data.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      <div className="row">
        <button className="btn ghost sm" onClick={() => setSelected(new Set(lines.map((_, i) => i)))}>All</button>
        <button className="btn ghost sm" onClick={() => setSelected(new Set())}>None</button>
      </div>
      {pantry.loading ? <Spinner /> : (
        <div className="panel list">
          {lines.map((l, i) => (
            <label key={i} className="li" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={sel.has(i)} onChange={() => { const n = new Set(sel); if (n.has(i)) n.delete(i); else n.add(i); setSelected(n); }} />
              <div className="main">
                <div>{l}</div>
                {inPantry(l, pantry.data) && <div className="small ok">In your pantry</div>}
              </div>
            </label>
          ))}
        </div>
      )}
      <button className="btn primary" onClick={add} disabled={!sel.size}>Add {sel.size} item{sel.size === 1 ? '' : 's'}</button>
    </Modal>
  );
}

export function ShareRecipeModal({ recipe, onClose }: { recipe: RecipeSnapshot; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const [text, setText] = useState('');
  const share = useAction(async () => {
    await shareRecipe(uid, recipe, text.trim());
    toast('Recipe shared with your friends');
    return true;
  });
  return (
    <Modal title="Share with friends" onClose={onClose}>
      <div className="row">
        <RecipeImage r={recipe} className="recipe-thumb" />
        <div><b>{recipe.name}</b><div className="small muted">Friends can view it, react, and save it to their own recipes.</div></div>
      </div>
      <EmojiField multiline value={text} onChange={setText} placeholder="Say something about it (optional)" maxLength={1000} />
      <ActionButton variant="primary" state={share.state} pendingLabel="Sharing…" onClick={async () => { if (await share.run()) onClose(); }}>Share to feed</ActionButton>
    </Modal>
  );
}

/** Pick a recipe from your library, or write a free-text note (for plans and menus). */
export function RecipePickerModal({ title = 'Choose a recipe', onPick, onClose }: {
  title?: string; onPick: (p: { recipeId: string | null; name: string }) => void; onClose: () => void;
}) {
  const { uid } = useMe();
  const recipes = useRecipes(uid);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const shown = recipes.data.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Modal title={title} onClose={onClose}>
      <input type="search" autoFocus placeholder="Search your recipes" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="panel list" style={{ maxHeight: 320, overflowY: 'auto' }}>
        {recipes.loading ? <div style={{ padding: 16 }}><Spinner /></div> : shown.length === 0
          ? <div className="small muted" style={{ padding: 16 }}>No recipes found. Add some under Recipes first.</div>
          : shown.map((r) => (
            <button key={r.id} className="li" onClick={() => onPick({ recipeId: r.id, name: r.name })}>
              <RecipeImage r={r} className="recipe-thumb" />
              <div className="main"><div className="name">{r.name}</div><div className="sub">{r.perServing ? `${fmtNum(r.perServing.kcal)} kcal / serving` : 'no nutrition yet'}</div></div>
            </button>
          ))}
      </div>
      <div className="row">
        <input placeholder="…or a note, e.g. Leftovers, Eating out" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn" disabled={!note.trim()} onClick={() => onPick({ recipeId: null, name: note.trim() })}>Add note</button>
      </div>
    </Modal>
  );
}
