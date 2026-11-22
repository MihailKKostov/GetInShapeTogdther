import { NavLink } from 'react-router-dom';
import { generatedAvatar } from '../../lib/avatar';
import type { Recipe } from '../../data/types';

const TABS = [
  { to: '/recipes', l: 'Recipes', end: true },
  { to: '/plan', l: 'Plan' },
  { to: '/grocery', l: 'Groceries' },
  { to: '/pantry', l: 'Pantry' },
  { to: '/menus', l: 'Menus' },
];

/** Sub-navigation shared by the recipe screens. */
export function RecipesNav() {
  return (
    <nav className="subnav" aria-label="Recipes">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'on' : '')}>{t.l}</NavLink>
      ))}
    </nav>
  );
}

export function Stars({ value, onChange, size = 18 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="stars" role={onChange ? 'radiogroup' : undefined} aria-label={`${value} of 5 stars`} style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((i) => onChange ? (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} star${i > 1 ? 's' : ''}`}
          className={i <= value ? 'on' : ''} onClick={() => onChange(value === i ? 0 : i)}>★</button>
      ) : <span key={i} className={i <= value ? 'on' : ''}>★</span>)}
    </span>
  );
}

/** Recipe photo, or a coloured placeholder with the initial. */
export function RecipeImage({ r, className = '', style }: { r: Pick<Recipe, 'imageUrl' | 'name'>; className?: string; style?: React.CSSProperties }) {
  const src = r.imageUrl || generatedAvatar(r.name || '?', r.name || '?');
  return <img className={`recipe-img ${r.imageUrl ? '' : 'ph'} ${className}`} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" style={style} />;
}

export function timeSummary(r: Pick<Recipe, 'totalTime' | 'prepTime' | 'cookTime'>): string {
  return r.totalTime || [r.prepTime && `prep ${r.prepTime}`, r.cookTime && `cook ${r.cookTime}`].filter(Boolean).join(' · ');
}
