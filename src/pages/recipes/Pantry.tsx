// Pantry (RecipeMan: PantryScreen): what you have, with purchase and expiration dates.
import { useMemo, useState } from 'react';
import { deletePantryItem, savePantryItem } from '../../data/recipes';
import type { PantryItem } from '../../data/types';
import { Empty, Modal, Panel, Seg, Skeleton, Toggle } from '../../components/ui';
import { useMe } from '../../hooks/useSession';
import { addDays, dateKey, daysBetween, parseKey } from '../../lib/dates';
import { AISLES, guessAisle, OTHER_AISLE } from '../../lib/recipes/aisles';
import { RecipesNav } from './bits';
import { usePantry } from './data';

function expiry(it: PantryItem): { label: string; cls: string } | null {
  if (!it.expirationDate) return null;
  const d = daysBetween(dateKey(), it.expirationDate);
  if (d < 0) return { label: `Expired ${-d}d ago`, cls: 'bad' };
  if (d === 0) return { label: 'Expires today', cls: 'bad' };
  if (d <= 3) return { label: `Expires in ${d}d`, cls: 'warn' };
  return { label: `Expires ${parseKey(it.expirationDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, cls: '' };
}

export default function Pantry() {
  const { uid } = useMe();
  const pantry = usePantry(uid);
  const [show, setShow] = useState<'in' | 'out' | 'all'>('in');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<PantryItem | 'new' | null>(null);
  const items = pantry.data.filter((i) => (show === 'all' || (show === 'in' ? i.inStock : !i.inStock)) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const soon = pantry.data.filter((i) => i.inStock && i.expirationDate && daysBetween(dateKey(), i.expirationDate) <= 3);
  const groups = useMemo(() => {
    const m = new Map<string, PantryItem[]>();
    for (const it of items) { const k = it.aisle || OTHER_AISLE; if (!m.has(k)) m.set(k, []); m.get(k)!.push(it); }
    return [...m.entries()].sort((a, b) => AISLES.indexOf(a[0]) - AISLES.indexOf(b[0])).map(([k, v]) => [k, v.sort((a, b) => a.name.localeCompare(b.name))] as const);
  }, [items]);

  return (
    <div className="page">
      <RecipesNav />
      <div className="row">
        <input type="search" placeholder="Search pantry" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setEdit('new')}>+ Add</button>
      </div>
      <Seg block value={show} onChange={setShow} options={[{ v: 'in', l: 'In stock' }, { v: 'out', l: 'Used up' }, { v: 'all', l: 'All' }]} />
      {soon.length > 0 && show !== 'out' && (
        <div className="warn-box">⏰ {soon.length} item{soon.length === 1 ? '' : 's'} expiring soon: {soon.map((i) => i.name).join(', ')}</div>
      )}
      {pantry.loading ? <Skeleton h={200} /> : items.length === 0 ? (
        <div className="panel"><Empty icon="🥫" title={pantry.data.length ? 'Nothing here' : 'Your pantry is empty'}>
          Add what you have at home. Bought grocery items can be moved here, and recipe ingredients you already have are left off your grocery list.
        </Empty></div>
      ) : groups.map(([k, v]) => (
        <Panel key={k} title={k} tight right={<span className="small muted">{v.length}</span>}>
          <div className="list">
            {v.map((it) => {
              const e = expiry(it);
              return (
                <button key={it.id} className="li" onClick={() => setEdit(it)}>
                  <div className="main">
                    <div className="name" style={it.inStock ? undefined : { color: 'var(--faint)' }}>{it.name}{it.quantity ? <span className="muted"> · {it.quantity}</span> : null}</div>
                    {e && <div className={`sub ${e.cls}`}>{e.label}</div>}
                  </div>
                  {!it.inStock && <span className="pill">Used up</span>}
                </button>
              );
            })}
          </div>
        </Panel>
      ))}
      {edit && <EditPantry it={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditPantry({ it, onClose }: { it: PantryItem | null; onClose: () => void }) {
  const { uid } = useMe();
  const [name, setName] = useState(it?.name ?? '');
  const [quantity, setQuantity] = useState(it?.quantity ?? '');
  const [aisle, setAisle] = useState(it?.aisle ?? '');
  const [purchase, setPurchase] = useState(it?.purchaseDate ?? (it ? '' : dateKey()));
  const [exp, setExp] = useState(it?.expirationDate ?? '');
  const [inStock, setInStock] = useState(it?.inStock ?? true);
  const save = () => {
    if (!name.trim()) return;
    savePantryItem(uid, {
      id: it?.id, name: name.trim(), quantity: quantity.trim(), aisle: aisle || guessAisle(name),
      purchaseDate: purchase || null, expirationDate: exp || null, inStock,
    });
    onClose();
  };
  return (
    <Modal title={it ? 'Edit pantry item' : 'Add to pantry'} onClose={onClose}>
      <div className="fgrid">
        <label className="f"><span>Item *</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Rolled oats" /></label>
        <label className="f"><span>Quantity</span><input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 1 kg" /></label>
      </div>
      <label className="f"><span>Aisle</span>
        <select value={aisle} onChange={(e) => setAisle(e.target.value)}>
          <option value="">Guess automatically{name ? ` (${guessAisle(name)})` : ''}</option>
          {AISLES.map((a) => <option key={a}>{a}</option>)}
        </select>
      </label>
      <div className="fgrid">
        <label className="f"><span>Bought</span><input type="date" value={purchase} onChange={(e) => setPurchase(e.target.value)} /></label>
        <label className="f"><span>Expires</span><input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></label>
      </div>
      <div className="row wrap" style={{ gap: 4 }}>
        {[3, 7, 14, 30].map((d) => <button key={d} type="button" className="btn sm" onClick={() => setExp(addDays(purchase || dateKey(), d))}>+{d} days</button>)}
      </div>
      <Toggle on={inStock} onChange={setInStock} label="In stock" />
      <div className="row">
        {it && <button className="btn danger" onClick={() => { deletePantryItem(uid, it.id); onClose(); }}>Delete</button>}
        <span className="grow" />
        <button className="btn primary" onClick={save} disabled={!name.trim()}>Save</button>
      </div>
    </Modal>
  );
}
