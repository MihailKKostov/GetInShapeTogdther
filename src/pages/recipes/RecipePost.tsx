// A recipe shared in the feed: card, full view, and "save to my recipes".
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { query } from 'firebase/firestore';
import { recipesCol, saveSharedRecipe } from '../../data/recipes';
import type { Post, Recipe } from '../../data/types';
import { Modal, useToast } from '../../components/ui';
import { useQuery } from '../../hooks/useFirestore';
import { useMe } from '../../hooks/useSession';
import { fmtNum } from '../../lib/units';
import { RecipeImage, timeSummary } from './bits';
import { RecipeView, useScale } from './RecipeView';

export function RecipePostBlock({ post, authorName }: { post: Post; authorName: string }) {
  const r = post.recipe!;
  const [open, setOpen] = useState(false);
  const ingredients = r.ingredients.split('\n').filter((l) => l.trim() && !l.trim().endsWith(':')).length;
  return (
    <>
      <button type="button" className="summary" onClick={() => setOpen(true)} style={{ border: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0, overflow: 'hidden' }}>
        {r.imageUrl && <RecipeImage r={r} style={{ aspectRatio: '16 / 9', maxHeight: 260 }} />}
        <div className="col" style={{ gap: 4, padding: '10px 12px 12px' }}>
          <b style={{ fontSize: 16 }}>📖 {r.name}</b>
          <span className="small muted">{[r.servings, timeSummary(r), `${ingredients} ingredient${ingredients === 1 ? '' : 's'}`, r.perServing ? `${fmtNum(r.perServing.kcal)} kcal/serving` : ''].filter(Boolean).join(' · ')}</span>
          <span className="small accent">View recipe →</span>
        </div>
      </button>
      {open && <SharedRecipeModal post={post} authorName={authorName} onClose={() => setOpen(false)} />}
    </>
  );
}

function SharedRecipeModal({ post, authorName, onClose }: { post: Post; authorName: string; onClose: () => void }) {
  const { uid } = useMe();
  const toast = useToast();
  const r = post.recipe!;
  const scale = useScale(r);
  const mine = post.authorId === uid;
  const library = useQuery<Recipe>(query(recipesCol(uid)), `recipes:${uid}`);
  const saved = useMemo(() => library.data.find((x) => x.sharedFrom?.postId === post.id), [library.data, post.id]);
  const save = () => {
    const id = saveSharedRecipe(uid, r, { uid: post.authorId, name: authorName, postId: post.id });
    toast(<>Saved to your recipes · <Link to={`/recipes/${id}`} style={{ color: '#fff', textDecoration: 'underline' }}>Open</Link></>);
  };
  return (
    <Modal title={r.name} onClose={onClose}>
      <RecipeView r={r} scale={scale} header={<div className="small muted">Shared by {mine ? 'you' : authorName}</div>}>
        {!mine && (saved
          ? <Link className="btn" to={`/recipes/${saved.id}`} onClick={onClose}>✓ In your recipes · Open</Link>
          : <button className="btn primary" onClick={save}>➕ Save to my recipes</button>)}
      </RecipeView>
    </Modal>
  );
}
