// The recipe book on a profile: your own (links into the Recipes tab) or a friend's (read-only, with
// "Add to my recipes"). Friends can read users/{uid}/recipes unless the owner turned sharing off.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { limit, query, where } from 'firebase/firestore';
import { recipesCol, saveSharedRecipe, snapshotOf } from '../../data/recipes';
import type { Recipe } from '../../data/types';
import { Empty, Modal, Skeleton, useToast } from '../../components/ui';
import { useQuery } from '../../hooks/useFirestore';
import { useMe } from '../../hooks/useSession';
import { fmtNum } from '../../lib/units';
import { RecipeImage, Stars, timeSummary } from './bits';
import { useRecipes } from './data';
import { RecipeView, useScale } from './RecipeView';

const PAGE = 6;

export function ProfileRecipes({ uid, name, self }: { uid: string; name: string; self: boolean }) {
  const recipes = useRecipes(uid);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Recipe | null>(null);

  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return recipes.data
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.ingredients.toLowerCase().includes(needle)
        || (r.categories ?? []).some((c) => c.toLowerCase().includes(needle)))
      // Their favourites and best-rated first, then newest.
      .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || (b.rating ?? 0) - (a.rating ?? 0)
        || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  }, [recipes.data, q]);

  if (recipes.loading) return <div style={{ padding: 16 }}><Skeleton h={160} /></div>;
  if (recipes.error) return <Empty icon="🔒" title="Private">{name} hasn't shared their recipe book.</Empty>;
  if (!recipes.data.length) {
    return (
      <Empty icon="📖" title="No recipes yet">
        {self ? <Link to="/recipes">Add your first recipe</Link> : `${name} hasn't added any recipes.`}
      </Empty>
    );
  }
  const shown = all ? sorted : sorted.slice(0, PAGE);
  return (
    <div className="col" style={{ padding: '4px 16px 16px', gap: 10 }}>
      <div className="row between">
        <span className="small muted">{recipes.data.length} recipe{recipes.data.length === 1 ? '' : 's'}</span>
        {self && <Link className="small" to="/recipes">Open Recipes →</Link>}
      </div>
      {recipes.data.length > PAGE && (
        <input type="search" placeholder={`Search ${self ? 'your' : `${name}'s`} recipes`} value={q} onChange={(e) => { setQ(e.target.value); setAll(true); }} />
      )}
      {shown.length === 0 ? <Empty icon="🔍" title="No matching recipes" /> : (
        <div className="recipe-grid">
          {shown.map((r) => {
            const body = (
              <>
                <RecipeImage r={r} />
                <div className="body">
                  <span className="name">{r.favorite ? '♥ ' : ''}{r.name}</span>
                  {r.rating > 0 && <Stars value={r.rating} size={13} />}
                  <span className="small muted trunc">{[timeSummary(r), r.perServing ? `${fmtNum(r.perServing.kcal)} kcal` : ''].filter(Boolean).join(' · ')}</span>
                </div>
              </>
            );
            return self
              ? <Link key={r.id} to={`/recipes/${r.id}`} className="recipe-card">{body}</Link>
              : <button key={r.id} type="button" className="recipe-card" onClick={() => setOpen(r)} style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0 }}>{body}</button>;
          })}
        </div>
      )}
      {!all && sorted.length > PAGE && <button className="btn sm" onClick={() => setAll(true)}>Show all {sorted.length}</button>}
      {open && <FriendRecipeModal r={open} owner={uid} ownerName={name} onClose={() => setOpen(null)} />}
    </div>
  );
}

function FriendRecipeModal({ r, owner, ownerName, onClose }: { r: Recipe; owner: string; ownerName: string; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const scale = useScale(r);
  const copies = useQuery<Recipe>(query(recipesCol(uid), where('sharedFrom.recipeId', '==', r.id), limit(1)), `recipes:${uid}:copyof:${r.id}`);
  const saved = copies.data[0];
  const save = () => {
    const id = saveSharedRecipe(uid, snapshotOf(r), { uid: owner, name: ownerName, recipeId: r.id });
    toast(<>Added to your recipes · <Link to={`/recipes/${id}`} style={{ color: '#fff', textDecoration: 'underline' }}>Open</Link></>);
  };
  return (
    <Modal title={r.name} onClose={onClose}>
      <RecipeView r={r} scale={scale} header={<div className="small muted">From {ownerName}'s recipes{r.rating > 0 ? ' · ' : ''}{r.rating > 0 && <Stars value={r.rating} size={12} />}</div>}>
        {copies.loading ? <button className="btn" disabled>…</button>
          : saved ? <Link className="btn" to={`/recipes/${saved.id}`} onClick={onClose}>✓ In your recipes · Open</Link>
            : <button className="btn primary" onClick={save}>＋ Add to my recipes</button>}
      </RecipeView>
    </Modal>
  );
}
