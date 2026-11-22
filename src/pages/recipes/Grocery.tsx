// Grocery lists (RecipeMan: GroceryScreen).
import { useMemo, useState } from 'react';
import {
  addToGroceryList, createGroceryList, deleteGroceryItems, deleteGroceryList, moveToPantry, renameGroceryList, updateGroceryItem,
} from '../../data/recipes';
import type { GroceryItem } from '../../data/types';
import { Empty, Modal, Panel, Seg, Skeleton, useToast } from '../../components/ui';
import { useMe } from '../../hooks/useSession';
import { AISLES, OTHER_AISLE } from '../../lib/recipes/aisles';
import { RecipesNav } from './bits';
import { useGroceryItems, useGroceryLists, usePantry } from './data';

export default function Grocery() {
  const { uid } = useMe();
  const toast = useToast();
  const lists = useGroceryLists(uid);
  const items = useGroceryItems(uid);
  const pantry = usePantry(uid);
  const [listId, setListId] = useState('');
  const [group, setGroup] = useState<'aisle' | 'recipe'>('aisle');
  const [text, setText] = useState('');
  const [manage, setManage] = useState(false);
  const [editItem, setEditItem] = useState<GroceryItem | null>(null);
  const current = lists.data.find((l) => l.id === listId) ?? lists.data[0];
  const mine = items.data.filter((i) => i.listId === current?.id);
  const open = mine.filter((i) => !i.checked);
  const done = mine.filter((i) => i.checked);

  const groups = useMemo(() => {
    const m = new Map<string, GroceryItem[]>();
    for (const it of open) {
      const k = group === 'aisle' ? (it.aisle || OTHER_AISLE) : (it.recipeName || 'Other items');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    const order = (k: string) => (group === 'aisle' ? AISLES.indexOf(k) : k === 'Other items' ? 999 : 0);
    return [...m.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, v.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [open, group]);

  const add = () => {
    const lines = text.split(/\n|,(?![^(]*\))/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const id = current?.id ?? createGroceryList(uid, 'Groceries');
    addToGroceryList(uid, id, lines, '', items.data);
    setText('');
  };

  const share = async () => {
    const body = groups.map(([k, v]) => `${k}:\n${v.map((i) => `• ${i.name}`).join('\n')}`).join('\n\n');
    const t = `${current?.name ?? 'Groceries'}\n\n${body}`;
    if (navigator.share) await navigator.share({ title: current?.name, text: t }).catch(() => undefined);
    else { await navigator.clipboard?.writeText(t); toast('List copied to clipboard'); }
  };

  if (lists.loading || items.loading) return <div className="page"><RecipesNav /><Skeleton h={240} /></div>;

  return (
    <div className="page">
      <RecipesNav />
      <div className="row between">
        {lists.data.length > 1 ? (
          <div className="chips grow">
            {lists.data.map((l) => <button key={l.id} className={`chip ${current?.id === l.id ? 'on' : ''}`} onClick={() => setListId(l.id)}>{l.name}</button>)}
          </div>
        ) : <h2 className="grow">{current?.name ?? 'Groceries'}</h2>}
        <button className="btn ghost sm" onClick={() => setManage(true)}>Lists</button>
      </div>

      <div className="row">
        <input placeholder="Add items, e.g. 2 lemons, milk" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary" onClick={add} disabled={!text.trim()}>Add</button>
      </div>
      <div className="row between">
        <Seg value={group} onChange={setGroup} options={[{ v: 'aisle', l: 'By aisle' }, { v: 'recipe', l: 'By recipe' }]} />
        <button className="btn sm" onClick={share} disabled={!open.length}>📤 Share</button>
      </div>

      {mine.length === 0 ? (
        <div className="panel"><Empty icon="🛒" title="Your list is empty">Add items above, or send a recipe's ingredients here from the recipe or the meal plan.</Empty></div>
      ) : (
        <>
          {groups.map(([k, v]) => (
            <Panel key={k} title={k} tight right={<span className="small muted">{v.length}</span>}>
              <div className="list">
                {v.map((it) => <ItemRow key={it.id} it={it} onEdit={() => setEditItem(it)} />)}
              </div>
            </Panel>
          ))}
          {done.length > 0 && (
            <Panel title={`In the cart (${done.length})`} tight footer={<>
              <button className="btn sm" onClick={() => { moveToPantry(uid, done, pantry.data); toast(`Moved ${done.length} item${done.length === 1 ? '' : 's'} to your pantry`); }}>Move to pantry</button>
              <button className="btn sm danger" onClick={() => deleteGroceryItems(uid, done.map((i) => i.id))}>Clear</button>
            </>}>
              <div className="list">{done.map((it) => <ItemRow key={it.id} it={it} onEdit={() => setEditItem(it)} />)}</div>
            </Panel>
          )}
        </>
      )}
      {manage && <ManageLists current={current?.id} onPick={setListId} onClose={() => setManage(false)} />}
      {editItem && <EditItem it={editItem} onClose={() => setEditItem(null)} />}
    </div>
  );
}

function ItemRow({ it, onEdit }: { it: GroceryItem; onEdit: () => void }) {
  const { uid } = useMe();
  return (
    <div className="li">
      <input type="checkbox" checked={it.checked} onChange={(e) => updateGroceryItem(uid, it.id, { checked: e.target.checked })} aria-label={`Bought ${it.name}`} style={{ width: 20, height: 20 }} />
      <button className="main" onClick={onEdit} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
        <div className="name" style={it.checked ? { textDecoration: 'line-through', color: 'var(--faint)' } : undefined}>{it.name}</div>
        {it.recipeName && <div className="sub">{it.recipeName}</div>}
      </button>
    </div>
  );
}

function EditItem({ it, onClose }: { it: GroceryItem; onClose: () => void }) {
  const { uid } = useMe();
  const [name, setName] = useState(it.name);
  const [aisle, setAisle] = useState(it.aisle || OTHER_AISLE);
  return (
    <Modal title="Edit item" onClose={onClose}>
      <label className="f"><span>Item</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label className="f"><span>Aisle</span>
        <select value={aisle} onChange={(e) => setAisle(e.target.value)}>{AISLES.map((a) => <option key={a}>{a}</option>)}</select>
      </label>
      <div className="row">
        <button className="btn danger" onClick={() => { deleteGroceryItems(uid, [it.id]); onClose(); }}>Delete</button>
        <span className="grow" />
        <button className="btn primary" onClick={() => { updateGroceryItem(uid, it.id, { name: name.trim() || it.name, aisle }); onClose(); }}>Save</button>
      </div>
    </Modal>
  );
}

function ManageLists({ current, onPick, onClose }: { current?: string; onPick: (id: string) => void; onClose: () => void }) {
  const { uid } = useMe();
  const lists = useGroceryLists(uid);
  const items = useGroceryItems(uid);
  const [name, setName] = useState('');
  return (
    <Modal title="Grocery lists" onClose={onClose}>
      <div className="panel list">
        {lists.data.map((l) => (
          <div key={l.id} className="li">
            <input defaultValue={l.name} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && renameGroceryList(uid, l.id, e.target.value.trim())} aria-label="List name" />
            <span className="small muted nowrap">{items.data.filter((i) => i.listId === l.id && !i.checked).length} items</span>
            <button className="btn sm" onClick={() => { onPick(l.id); onClose(); }} disabled={l.id === current}>Open</button>
            <button className="btn sm danger" onClick={() => confirm(`Delete "${l.name}" and its items?`) && deleteGroceryList(uid, l.id, items.data)} aria-label={`Delete ${l.name}`}>✕</button>
          </div>
        ))}
      </div>
      <div className="row">
        <input placeholder="New list, e.g. Costco" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()} onClick={() => { const id = createGroceryList(uid, name); setName(''); onPick(id); onClose(); }}>Create</button>
      </div>
    </Modal>
  );
}
