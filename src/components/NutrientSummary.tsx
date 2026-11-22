import type { Nutrients } from '../data/types';
import { fmtNum } from '../lib/units';

export function NutrientSummary({ n }: { n: Nutrients }) {
  return (
    <div className="stats c4">
      <div className="stat"><div className="k">Energy</div><div className="v">{fmtNum(n.kcal)}<small> kcal</small></div></div>
      <div className="stat"><div className="k" style={{ color: 'var(--protein)' }}>Protein</div><div className="v">{fmtNum(n.protein, 1)}<small> g</small></div></div>
      <div className="stat"><div className="k" style={{ color: 'var(--carbs)' }}>Carbs</div><div className="v">{fmtNum(n.carbs, 1)}<small> g</small></div></div>
      <div className="stat"><div className="k" style={{ color: 'var(--fat)' }}>Fat</div><div className="v">{fmtNum(n.fat, 1)}<small> g</small></div></div>
    </div>
  );
}
