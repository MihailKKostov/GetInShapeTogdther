// A recipe shared in the feed: card, full view, and "save to my recipes".
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { limit, query, where } from 'firebase/firestore';
import { recipesCol, saveSharedRecipe } from '../../data/recipes';
import type { Post, Recipe } from '../../data/types';
import { Modal, useToast } from '../../components/ui';
import { useQuery } from '../../hooks/useFirestore';
import { useMe } from '../../hooks/useSession';
import { fmtNum } from '../../lib/units';
import { RecipeImage, timeSummary } from './bits';
import { RecipeView, useScale } from './RecipeView';

/** The viewer's copy of a shared recipe, if they already saved it from this post. */
function useSavedCopy(uid: string, post: Post, enabled: boolean) {
  const q = enabled ? query(recipesCol(uid), where('sharedFrom.postId', '==', post.id), limit(1)) : null;
  const res = useQuery<Recipe>(q, `recipes:${uid}:from:${post.id}:${enabled}`);
  return { saved: res.data[0] as Recipe | undefined, loading: res.loading };
}

/** "Add to my recipes" for a friend's recipe post; turns into "✓ In your recipes" once saved. */
function SaveRecipeButton({ post, authorName, size, onOpen }: { post: Post; authorName: string; size?: 'sm'; onOpen?: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const { saved, loading } = useSavedCopy(uid, post, true);
  const cls = size === 'sm' ? 'btn sm' : 'btn';
  if (loading) return <button className={cls} disabled>…</button>;
  if (saved) return <Link className={cls} to={`/recipes/${saved.id}`} onClick={onOpen}>✓ In your recipes · Open</Link>;
  const save = () => {
    const id = saveSharedRecipe(uid, post.recipe!, { uid: post.authorId, name: authorName, postId: post.id });
    toast(<>Added to your recipes · <Link to={`/recipes/${id}`} style={{ color: '#fff', textDecoration: 'underline' }}>Open</Link></>);
  };
  return <button className={`${cls} primary`} onClick={save}>＋ Add to my recipes</button>;
}

export function RecipePostBlock({ post, authorName }: { post: Post; authorName: string }) {
  const { uid } = useMe();
  const r = post.recipe!;
  const mine = post.authorId === uid;
  const [open, setOpen] = useState(false);
  const ingredients = r.ingredients.split('\n').filter((l) => l.trim() && !l.trim().endsWith(':')).length;
  return (
    <>
      <div className="summary" style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
        <button type="button" onClick={() => setOpen(true)} style={{ border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0 }}>
          {r.imageUrl && <RecipeImage r={r} style={{ aspectRatio: '16 / 9', maxHeight: 260 }} />}
          <div className="col" style={{ gap: 4, padding: '10px 12px 0' }}>
            <b style={{ fontSize: 16 }}>📖 {r.name}</b>
            <span className="small muted">{[r.servings, timeSummary(r), `${ingredients} ingredient${ingredients === 1 ? '' : 's'}`, r.perServing ? `${fmtNum(r.perServing.kcal)} kcal/serving` : ''].filter(Boolean).join(' · ')}</span>
          </div>
        </button>
        <div className="row wrap" style={{ gap: 8, padding: '10px 12px 12px' }}>
          <button className="btn sm" onClick={() => setOpen(true)}>View recipe</button>
          {!mine && <SaveRecipeButton post={post} authorName={authorName} size="sm" />}
        </div>
      </div>
      {open && <SharedRecipeModal post={post} authorName={authorName} onClose={() => setOpen(false)} />}
    </>
  );
}

function SharedRecipeModal({ post, authorName, onClose }: { post: Post; authorName: string; onClose: () => void }) {
  const { uid } = useMe();
  const r = post.recipe!;
  const scale = useScale(r);
  const mine = post.authorId === uid;
  return (
    <Modal title={r.name} onClose={onClose}>
      <RecipeView r={r} scale={scale} header={<div className="small muted">Shared by {mine ? 'you' : authorName}</div>}>
        {!mine && <SaveRecipeButton post={post} authorName={authorName} onOpen={onClose} />}
      </RecipeView>
    </Modal>
  );
}
