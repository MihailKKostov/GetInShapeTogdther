// Read/cook view of a recipe (RecipeMan: RecipeDetailScreen). Used for your own recipes and for
// recipes friends share in the feed.
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { RecipeSnapshot } from '../../data/types';
import { Lightbox, NumInput, Seg } from '../../components/ui';
import { findTimers } from '../../lib/recipes/durations';
import { headerText, isHeader, roundForDisplay, servingsNumber, transformIngredient, type UnitSystem } from '../../lib/recipes/ingredients';
import { fmtNum } from '../../lib/units';
import { RecipeImage } from './bits';
import { useTimers } from './timers';

const FACTORS: { v: string; l: string }[] = [{ v: '0.5', l: '½×' }, { v: '1', l: '1×' }, { v: '2', l: '2×' }, { v: '3', l: '3×' }];

export function useScale(r: RecipeSnapshot) {
  const base = servingsNumber(r.servings);
  const [factor, setFactor] = useState(1);
  return { base, factor, setFactor };
}

export function RecipeView({ r, header, children, scale }: {
  r: RecipeSnapshot; header?: ReactNode; children?: ReactNode; scale: ReturnType<typeof useScale>;
}) {
  const { start } = useTimers();
  const [units, setUnits] = useState<UnitSystem>('original');
  const [crossed, setCrossed] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [showNutrition, setShowNutrition] = useState(false);
  const { base, factor, setFactor } = scale;
  const photos = useMemo(() => [r.imageUrl, ...(r.photos ?? []).map((p) => p.url)].filter(Boolean), [r.imageUrl, r.photos]);
  const ingredients = r.ingredients.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const steps = r.directions.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let stepNo = 0;

  const toggle = (i: number) => setCrossed((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const renderStep = (text: string, label: string) => {
    const t = findTimers(text);
    if (!t.length) return text;
    const out: ReactNode[] = [];
    let last = 0;
    t.forEach((m, i) => {
      out.push(text.slice(last, m.start));
      out.push(
        <button key={i} type="button" className="timer-link" title="Start timer"
          onClick={(e) => { e.stopPropagation(); start(`${label}: ${m.label}`, m.seconds); }}>
          ⏱ {text.slice(m.start, m.end)}
        </button>,
      );
      last = m.end;
    });
    out.push(text.slice(last));
    return out;
  };

  return (
    <div className="col gap2">
      {photos.length > 0 && (
        <div className="col" style={{ gap: 6 }}>
          <button type="button" onClick={() => setZoom(photos[0])} style={{ border: 0, padding: 0, background: 'none', cursor: 'zoom-in' }}>
            <RecipeImage r={{ imageUrl: photos[0], name: r.name }} style={{ borderRadius: 14, maxHeight: 320 }} />
          </button>
          {photos.length > 1 && (
            <div className="chips">
              {photos.slice(1).map((p) => (
                <button key={p} type="button" onClick={() => setZoom(p)} style={{ border: 0, padding: 0, background: 'none', cursor: 'zoom-in', flex: 'none' }}>
                  <img src={p} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10 }} referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {header}
      {r.description && <p className="muted" style={{ margin: 0 }}>{r.description}</p>}
      <div className="row wrap" style={{ gap: 6 }}>
        {r.servings && <span className="pill">🍽 {r.servings}</span>}
        {r.prepTime && <span className="pill">Prep {r.prepTime}</span>}
        {r.cookTime && <span className="pill">Cook {r.cookTime}</span>}
        {r.totalTime && <span className="pill">Total {r.totalTime}</span>}
        {r.difficulty && <span className="pill">{r.difficulty}</span>}
        {(r.categories ?? []).map((c) => <span key={c} className="pill accent">{c}</span>)}
      </div>

      {children}

      {r.perServing && (
        <section className="panel">
          <div className="panel-h"><span className="t">Nutrition</span><span className="sp" /><span className="small muted">per serving{r.perServingSource === 'ai' ? ' · AI estimate' : ''}</span></div>
          <div className="panel-b">
            <div className="summary-nums">
              <div><b>{fmtNum(r.perServing.kcal)}</b><span>kcal</span></div>
              <div><b style={{ color: 'var(--protein)' }}>{fmtNum(r.perServing.protein)} g</b><span>protein</span></div>
              <div><b style={{ color: 'var(--carbs)' }}>{fmtNum(r.perServing.carbs)} g</b><span>carbs</span></div>
              <div><b style={{ color: 'var(--fat)' }}>{fmtNum(r.perServing.fat)} g</b><span>fat</span></div>
              {r.perServing.fiber != null && <div><b>{fmtNum(r.perServing.fiber)} g</b><span>fiber</span></div>}
            </div>
            {r.nutrition && (
              <>
                <button className="btn ghost sm" style={{ paddingLeft: 0, marginTop: 6 }} onClick={() => setShowNutrition((x) => !x)}>{showNutrition ? 'Hide' : 'Show'} full nutrition</button>
                {showNutrition && <pre className="small muted" style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{r.nutrition}</pre>}
              </>
            )}
          </div>
        </section>
      )}

      {ingredients.length > 0 && (
        <section className="panel">
          <div className="panel-h">
            <span className="t">Ingredients</span><span className="sp" />
            {crossed.size > 0 && <button className="btn ghost sm" onClick={() => setCrossed(new Set())}>Reset</button>}
          </div>
          <div className="panel-b col">
            <div className="row wrap between">
              <Seg value={String(factor)} onChange={(v) => setFactor(Number(v))}
                options={FACTORS.some((f) => Number(f.v) === factor) ? FACTORS : [...FACTORS, { v: String(factor), l: `${roundForDisplay(factor)}×` }]} />
              <Seg<UnitSystem> value={units} onChange={setUnits} options={[{ v: 'original', l: 'Original' }, { v: 'metric', l: 'Metric' }, { v: 'us', l: 'US' }]} />
            </div>
            <div className="row small muted" style={{ gap: 6 }}>
              {base ? <>
                <span>Servings</span>
                <div style={{ width: 90 }}><NumInput value={Math.round(base * factor * 100) / 100} onChange={(v) => v !== '' && v > 0 && setFactor(v / base)} ariaLabel="Servings" /></div>
                <span>(recipe makes {roundForDisplay(base)})</span>
              </> : <>
                <span>Multiply by</span>
                <div style={{ width: 90 }}><NumInput value={factor} onChange={(v) => v !== '' && v > 0 && setFactor(v)} ariaLabel="Scale factor" /></div>
              </>}
            </div>
            <ul className="ingredients">
              {ingredients.map((line, i) => isHeader(line) ? (
                <li key={i} className="header">{headerText(line).replace(/:$/, '')}</li>
              ) : (
                <li key={i} className={crossed.has(i) ? 'crossed' : ''} onClick={() => toggle(i)}>
                  <span className="box">{crossed.has(i) ? '✓' : ''}</span>
                  <span>{transformIngredient(line, factor, units)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {steps.length > 0 && (
        <section className="panel">
          <div className="panel-h"><span className="t">Directions</span><span className="sp" /><span className="small muted">tap a step to mark your place</span></div>
          <div className="panel-b tight">
            <ol className="steps">
              {steps.map((s, i) => {
                if (isHeader(s) && s.length < 60) return <li key={i} className="section">{headerText(s).replace(/:$/, '')}</li>;
                stepNo++;
                const n = stepNo;
                return (
                  <li key={i} className={step === i ? 'cur' : ''} onClick={() => setStep(step === i ? null : i)}>
                    <span className="n">{n}</span>
                    <span>{renderStep(s, `Step ${n}`)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}

      {r.notes && (
        <section className="panel">
          <div className="panel-h"><span className="t">Notes</span></div>
          <div className="panel-b"><p className="post-text" style={{ margin: 0 }}>{r.notes.split('\n').map((l, i) => <Fragment key={i}>{l}<br /></Fragment>)}</p></div>
        </section>
      )}
      {(r.source || r.sourceUrl) && (
        <div className="small muted">
          Source: {r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener">{r.source || hostOf(r.sourceUrl)} ↗</a> : r.source}
        </div>
      )}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
}
