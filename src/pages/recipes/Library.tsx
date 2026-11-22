import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Recipe } from '../../data/types';
import { Empty, Icon, Seg, Skeleton } from '../../components/ui';
import { useMe } from '../../hooks/useSession';
import { fmtNum } from '../../lib/units';
import { RecipeImage, RecipesNav, Stars, timeSummary } from './bits';
import { useRecipes } from './data';

type Sort = 'name' | 'rating' | 'added' | 'cooked';
const VIEW_KEY = 'wefit.recipes.view';

export default function Library() {
  const { uid } = useMe();
  const nav = useNavigate();
  const recipes = useRecipes(uid);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [view, setViewState] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as 'grid' | 'list') || 'grid'; } catch { return 'grid'; }
  });
  const setView = (v: 'grid' | 'list') => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes.data) for (const c of r.categories ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [recipes.data]);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = recipes.data.filter((r) => {
      if (cat === 'fav' && !r.favorite) return false;
      if (cat === 'none' && r.categories?.length) return false;
      if (cat !== 'all' && cat !== 'fav' && cat !== 'none' && !r.categories?.includes(cat)) return false;
      if (!terms.length) return true;
      const hay = `${r.name}\n${r.ingredients}\n${(r.categories ?? []).join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const ms = (t: Recipe['createdAt']) => t?.toMillis?.() ?? 0;
    return list.sort((a, b) => {
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name);
      if (sort === 'added') return ms(b.createdAt) - ms(a.createdAt);
      if (sort === 'cooked') return (b.lastCookedAt ?? 0) - (a.lastCookedAt ?? 0) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [recipes.data, q, cat, sort]);

  const random = () => {
    const pool = shown.length ? shown : recipes.data;
    if (pool.length) nav(`/recipes/${pool[Math.floor(Math.random() * pool.length)].id}`);
  };

  return (
    <div className="page">
      <RecipesNav />
      <div className="row">
        <Link className="btn primary grow" to="/recipes/new"><Icon name="plus" size={18} stroke={2.4} /> New</Link>
        <Link className="btn grow" to="/recipes/import?mode=photo"><Icon name="camera" size={18} /> Photo</Link>
        <Link className="btn grow" to="/recipes/import"><Icon name="upload" size={18} /> Import</Link>
        <button className="btn" onClick={random} disabled={!recipes.data.length} title="Random recipe" aria-label="Random recipe">🎲</button>
      </div>
      <input type="search" placeholder="Search recipes and ingredients" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All {recipes.data.length || ''}</button>
        <button className={`chip ${cat === 'fav' ? 'on' : ''}`} onClick={() => setCat('fav')}>♥ Favorites</button>
        {categories.map(([c, n]) => (
          <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c} <span className="muted">{n}</span></button>
        ))}
        {categories.length > 0 && <button className={`chip ${cat === 'none' ? 'on' : ''}`} onClick={() => setCat('none')}>Uncategorized</button>}
      </div>
      <div className="row between">
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: 'auto' }} aria-label="Sort">
          <option value="name">Name</option>
          <option value="rating">Rating</option>
          <option value="added">Recently added</option>
          <option value="cooked">Recently cooked</option>
        </select>
        <Seg value={view} onChange={setView} options={[{ v: 'grid', l: '▦' }, { v: 'list', l: '☰' }]} />
      </div>

      {recipes.loading ? <Skeleton h={240} /> : recipes.data.length === 0 ? (
        <div className="panel">
          <Empty icon="📖" title="Your recipe box is empty">
            <p>Write a recipe, paste a link from any recipe site, or import your Paprika export.</p>
          </Empty>
        </div>
      ) : shown.length === 0 ? (
        <div className="panel"><Empty icon="🔍" title="No matching recipes" /></div>
      ) : view === 'grid' ? (
        <div className="recipe-grid">
          {shown.map((r) => (
            <Link key={r.id} to={`/recipes/${r.id}`} className="recipe-card">
              <RecipeImage r={r} />
              <div className="body">
                <span className="name">{r.favorite ? '♥ ' : ''}{r.name}</span>
                {r.rating > 0 && <Stars value={r.rating} size={13} />}
                <span className="small muted trunc">{[timeSummary(r), r.perServing ? `${fmtNum(r.perServing.kcal)} kcal` : ''].filter(Boolean).join(' · ')}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel list">
          {shown.map((r) => (
            <Link key={r.id} to={`/recipes/${r.id}`} className="li">
              <RecipeImage r={r} className="recipe-thumb" />
              <div className="main">
                <div className="name">{r.favorite ? '♥ ' : ''}{r.name}</div>
                <div className="sub">{[timeSummary(r), (r.categories ?? []).join(', ')].filter(Boolean).join(' · ') || ' '}</div>
              </div>
              <div className="end">
                {r.rating > 0 && <Stars value={r.rating} size={12} />}
                {r.perServing && <div className="small muted">{fmtNum(r.perServing.kcal)} kcal</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
