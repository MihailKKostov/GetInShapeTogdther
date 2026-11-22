import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteRecipe, markCooked, updateRecipe } from '../../data/recipes';
import { ActionButton, Empty, Icon, Skeleton, Toggle, useToast } from '../../components/ui';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useSession';
import { relTime } from '../../lib/dates';
import { ingredientLines, transformIngredient } from '../../lib/recipes/ingredients';
import { useWakeLock } from '../Activities';
import { RecipesNav, Stars } from './bits';
import { useRecipe } from './data';
import { EstimateNutritionButton, GroceryModal, LogRecipeModal, PlanModal, ShareRecipeModal } from './dialogs';
import { RecipeView, useScale } from './RecipeView';

const AWAKE_KEY = 'wefit.cook.awake';

export default function RecipeDetail() {
  const { id } = useParams();
  const { uid } = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const r = useRecipe(uid, id);
  const scale = useScale(r.data ?? { servings: '' } as never);
  const [dialog, setDialog] = useState<'log' | 'plan' | 'grocery' | 'share' | null>(null);
  const [menu, setMenu] = useState(false);
  const [awake, setAwakeState] = useState(() => { try { return localStorage.getItem(AWAKE_KEY) !== 'off'; } catch { return true; } });
  const setAwake = (v: boolean) => { setAwakeState(v); try { localStorage.setItem(AWAKE_KEY, v ? 'on' : 'off'); } catch { /* ignore */ } };
  useWakeLock(awake && !!r.data);
  const del = useAction(async () => { await deleteRecipe(uid, r.data!); toast('Recipe deleted'); nav('/recipes', { replace: true }); });

  if (r.loading) return <div className="page"><RecipesNav /><Skeleton h={280} /></div>;
  if (!r.data) return <div className="page"><RecipesNav /><div className="panel"><Empty icon="🤷" title="Recipe not found"><Link to="/recipes">Back to recipes</Link></Empty></div></div>;
  const recipe = r.data;

  const shareText = async () => {
    const text = [
      recipe.name, recipe.servings && `Serves: ${recipe.servings}`, '',
      'Ingredients:', ...ingredientLines(recipe.ingredients).map((l) => `• ${transformIngredient(l, scale.factor)}`), '',
      'Directions:', ...recipe.directions.split('\n').filter(Boolean).map((s, i) => `${i + 1}. ${s}`),
      recipe.sourceUrl && `\n${recipe.sourceUrl}`,
    ].filter((x): x is string => typeof x === 'string').join('\n');
    if (navigator.share) await navigator.share({ title: recipe.name, text }).catch(() => undefined);
    else { await navigator.clipboard?.writeText(text); toast('Recipe copied to clipboard'); }
  };

  return (
    <div className="page">
      <RecipesNav />
      <RecipeView r={recipe} scale={scale} header={
        <div className="col" style={{ gap: 6 }}>
          <div className="row between top">
            <h1 style={{ fontSize: 24 }}>{recipe.name}</h1>
            <div className="row" style={{ gap: 2, position: 'relative' }}>
              <button className="icon-btn" style={{ color: recipe.favorite ? 'var(--bad)' : undefined, fontSize: 22 }}
                aria-label={recipe.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => updateRecipe(uid, recipe.id, { favorite: !recipe.favorite })}>
                {recipe.favorite ? '♥' : '♡'}
              </button>
              <button className="icon-btn" aria-label="More" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><Icon name="more" /></button>
              {menu && (
                <div className="panel" style={{ position: 'absolute', right: 0, top: 42, zIndex: 30, minWidth: 210, boxShadow: 'var(--shadow-lg)' }} onClick={() => setMenu(false)}>
                  <div className="list">
                    <Link className="li" to={`/recipes/${recipe.id}/edit`}>✏️ Edit</Link>
                    <button className="li" onClick={() => { markCooked(uid, recipe.id); toast('Marked as cooked today'); }}>✅ Mark as cooked today</button>
                    <button className="li" onClick={shareText}>📤 Share as text</button>
                    {recipe.sourceUrl && <a className="li" href={recipe.sourceUrl} target="_blank" rel="noreferrer noopener">🌐 Open original page</a>}
                    <button className="li" style={{ color: 'var(--bad)' }} onClick={() => confirm(`Delete "${recipe.name}"?`) && del.run()}>🗑 Delete</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="row wrap between">
            <Stars value={recipe.rating ?? 0} onChange={(v) => updateRecipe(uid, recipe.id, { rating: v })} size={22} />
            <span className="small muted">{recipe.lastCookedAt ? `Cooked ${relTime(new Date(recipe.lastCookedAt))}` : 'Not cooked yet'}</span>
          </div>
          {recipe.sharedFrom && <div className="small muted">Saved from {recipe.sharedFrom.name}'s post</div>}
        </div>
      }>
        <div className="col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn primary grow" onClick={() => setDialog('log')}>🍽 Log to diary</button>
            <button className="btn grow" onClick={() => setDialog('plan')}>📅 Plan</button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn grow" onClick={() => setDialog('grocery')}>🛒 Groceries</button>
            <button className="btn grow" onClick={() => setDialog('share')}>👥 Share</button>
          </div>
          {!recipe.perServing && (
            <div className="warn-box row wrap" style={{ gap: 8 }}>
              <span className="grow">No nutrition per serving yet — needed to log it to your diary.</span>
              <EstimateNutritionButton recipe={recipe} />
              <Link className="btn sm" to={`/recipes/${recipe.id}/edit`}>Enter manually</Link>
            </div>
          )}
          <Toggle on={awake} onChange={setAwake} label={<span className="small">Keep screen on while cooking</span>} />
        </div>
      </RecipeView>
      {del.state === 'pending' && <ActionButton state="pending">Deleting</ActionButton>}

      {dialog === 'log' && <LogRecipeModal recipe={recipe} onClose={() => setDialog(null)} />}
      {dialog === 'plan' && <PlanModal recipe={recipe} onClose={() => setDialog(null)} />}
      {dialog === 'grocery' && <GroceryModal recipe={recipe} factor={scale.factor} onClose={() => setDialog(null)} />}
      {dialog === 'share' && <ShareRecipeModal recipe={recipe} onClose={() => setDialog(null)} />}
    </div>
  );
}
