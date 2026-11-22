// Menus (RecipeMan: MenusScreen): reusable groups of meals, added to the meal plan in one go.
import { useMemo, useState } from 'react';
import { addMenuToPlan, deleteMenu, MEAL_LABELS, saveMenu } from '../../data/recipes';
import { MEALS, type Meal, type MenuItem, type RecipeMenu } from '../../data/types';
import { Empty, Modal, NumInput, Seg, Skeleton, useToast } from '../../components/ui';
import { useMe } from '../../hooks/useSession';
import { addDays, dateKey } from '../../lib/dates';
import { RecipesNav } from './bits';
import { useMenus, useRecipes } from './data';
import { RecipePickerModal } from './dialogs';

export default function Menus() {
  const { uid } = useMe();
  const menus = useMenus(uid);
  const [edit, setEdit] = useState<RecipeMenu | 'new' | null>(null);
  const [apply, setApply] = useState<RecipeMenu | null>(null);
  return (
    <div className="page">
      <RecipesNav />
      <button className="btn primary" onClick={() => setEdit('new')}>+ New menu</button>
      {menus.loading ? <Skeleton h={160} /> : menus.data.length === 0 ? (
        <div className="panel"><Empty icon="📋" title="No menus yet">A menu is a reusable group of meals, like "Holiday dinner" or "Meal-prep week". Add it to your meal plan in one tap.</Empty></div>
      ) : (
        <div className="panel list">
          {[...menus.data].sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
            <div key={m.id} className="li">
              <button className="main" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => setEdit(m)}>
                <div className="name">{m.name}</div>
                <div className="sub">{m.items.length} meal{m.items.length === 1 ? '' : 's'} over {m.days} day{m.days === 1 ? '' : 's'}{m.notes ? ` · ${m.notes}` : ''}</div>
              </button>
              <button className="btn sm soft" onClick={() => setApply(m)} disabled={!m.items.length}>Add to plan</button>
            </div>
          ))}
        </div>
      )}
      {edit && <EditMenu menu={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {apply && <ApplyMenuModal menu={apply} onClose={() => setApply(null)} />}
    </div>
  );
}

function ApplyMenuModal({ menu, onClose }: { menu: RecipeMenu; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const [from, setFrom] = useState(dateKey());
  return (
    <Modal title={`Add "${menu.name}" to the plan`} onClose={onClose}>
      <label className="f"><span>Day 1 is</span><input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
      <button className="btn primary" onClick={() => { addMenuToPlan(uid, menu, from, addDays); toast(`Added ${menu.items.length} meals to your plan`); onClose(); }}>Add {menu.items.length} meals</button>
    </Modal>
  );
}

function EditMenu({ menu, onClose }: { menu: RecipeMenu | null; onClose: () => void }) {
  const { uid } = useMe();
  const recipes = useRecipes(uid);
  const names = useMemo(() => new Map(recipes.data.map((r) => [r.id, r.name])), [recipes.data]);
  const [name, setName] = useState(menu?.name ?? '');
  const [notes, setNotes] = useState(menu?.notes ?? '');
  const [days, setDays] = useState<number | ''>(menu?.days ?? 7);
  const [items, setItems] = useState<MenuItem[]>(menu?.items ?? []);
  const [picking, setPicking] = useState<{ day: number; meal: Meal } | null>(null);
  const [meal, setMeal] = useState<Meal>('dinner');
  const n = Math.max(1, Math.min(31, Number(days) || 1));
  const save = () => {
    if (!name.trim()) return;
    saveMenu(uid, { id: menu?.id, name: name.trim(), notes: notes.trim(), days: n, items: items.filter((i) => i.day < n) });
    onClose();
  };
  return (
    <Modal title={menu ? 'Edit menu' : 'New menu'} onClose={onClose}>
      <div className="fgrid">
        <label className="f"><span>Name *</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Meal-prep week" /></label>
        <label className="f"><span>Days</span><NumInput value={days} onChange={setDays} /></label>
      </div>
      <label className="f"><span>Notes</span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <Seg<Meal> block value={meal} onChange={setMeal} options={MEALS.map((m) => ({ v: m, l: MEAL_LABELS[m] }))} />
      <div className="panel list">
        {Array.from({ length: n }, (_, d) => (
          <div key={d} className="li" style={{ alignItems: 'flex-start' }}>
            <span className="small muted" style={{ width: 46, flex: 'none', paddingTop: 4 }}>Day {d + 1}</span>
            <div className="main col" style={{ gap: 4 }}>
              {items.map((it, i) => it.day === d && (
                <div key={i} className="row" style={{ gap: 6 }}>
                  <span className="small muted" style={{ width: 62 }}>{MEAL_LABELS[it.meal]}</span>
                  <span className="grow trunc">{it.recipeId ? names.get(it.recipeId) ?? it.name : it.name}</span>
                  <button className="btn ghost sm" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                </div>
              ))}
              <button className="btn ghost sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setPicking({ day: d, meal })}>+ {MEAL_LABELS[meal]}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="row">
        {menu && <button className="btn danger" onClick={() => { if (confirm(`Delete "${menu.name}"?`)) { deleteMenu(uid, menu.id); onClose(); } }}>Delete</button>}
        <span className="grow" />
        <button className="btn primary" onClick={save} disabled={!name.trim()}>Save menu</button>
      </div>
      {picking && <RecipePickerModal onClose={() => setPicking(null)} onPick={(p) => { setItems([...items, { ...picking, ...p }]); setPicking(null); }} />}
    </Modal>
  );
}

