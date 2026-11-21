import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

/** Measure the container so SVG text renders at its real pixel size on any screen. */
export function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceRange(min: number, max: number, steps = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / steps;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

export interface LinePoint { x: number; y: number; label: string }

/** Time-series line chart with optional target line and a readout row. */
export function LineChart({
  points, target, unit, h = 180, fmt = (v: number) => v.toFixed(1),
}: { points: LinePoint[]; target?: number; unit: string; h?: number; fmt?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, W] = useWidth();
  if (points.length === 0) return null;
  const L = 40, R = 8, T = 10, B = 20;
  const ys = points.map((p) => p.y).concat(target != null ? [target] : []);
  const { lo, hi, ticks } = niceRange(Math.min(...ys), Math.max(...ys));
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const sx = (x: number) => L + ((x - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const sy = (y: number) => T + (1 - (y - lo) / (hi - lo || 1)) * (h - T - B);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join('');
  const sel = hover != null ? points[hover] : points[points.length - 1];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(sx(p.x) - x); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };

  const first = points[0], last = points[points.length - 1];
  return (
    <div className="col" style={{ gap: 4 }} ref={box}>
      <div className="row between small">
        <span className="muted">› {sel.label}</span>
        <b>{fmt(sel.y)} {unit}</b>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${h}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="chart">
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridl" x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} />
            <text x={L - 6} y={sy(t) + 3} textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        <line className="axis" x1={L} x2={L} y1={T} y2={h - B} />
        <line className="axis" x1={L} x2={W - R} y1={h - B} y2={h - B} />
        {target != null && (
          <g>
            <line className="target" x1={L} x2={W - R} y1={sy(target)} y2={sy(target)} />
            <text x={W - R} y={sy(target) - 4} textAnchor="end" style={{ fill: 'var(--accent)' }}>TARGET {fmt(target)}</text>
          </g>
        )}
        <path className="ln" d={d} />
        {points.length <= 60 && points.map((p, i) => <rect key={i} className="pt" x={sx(p.x) - 2} y={sy(p.y) - 2} width={4} height={4} />)}
        {hover != null && <line className="hover-line" x1={sx(sel.x)} x2={sx(sel.x)} y1={T} y2={h - B} />}
        {hover != null && <rect x={sx(sel.x) - 3.5} y={sy(sel.y) - 3.5} width={7} height={7} fill="var(--accent)" />}
        <text x={L} y={h - 5}>{first.label}</text>
        <text x={W - R} y={h - 5} textAnchor="end">{last.label}</text>
      </svg>
    </div>
  );
}

export interface BarDatum { key: string; label: string; value: number; target?: number; cls?: string; tip?: string }

/** Vertical bars with optional per-bar target marks. */
export function BarChart({
  data, unit, h = 160, band, fmt = (v: number) => Math.round(v).toLocaleString('en-US'), onSelect,
}: {
  data: BarDatum[]; unit: string; h?: number; band?: [number, number];
  fmt?: (v: number) => string; onSelect?: (key: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, W] = useWidth();
  if (!data.length) return null;
  const L = 40, R = 8, T = 10, B = 20;
  const maxV = Math.max(...data.map((d) => Math.max(d.value, d.target ?? 0)), band?.[1] ?? 0, 1);
  const { hi, ticks } = niceRange(0, maxV);
  const sy = (v: number) => T + (1 - v / (hi || 1)) * (h - T - B);
  const bw = (W - L - R) / data.length;
  const sel = hover != null ? data[hover] : null;
  return (
    <div className="col" style={{ gap: 4 }} ref={box}>
      <div className="row between small" style={{ minHeight: 18 }}>
        <span className="muted">› {sel ? sel.label : 'hover / tap a bar'}</span>
        <b>{sel ? `${fmt(sel.value)} ${unit}${sel.target ? ` / ${fmt(sel.target)}` : ''}${sel.tip ? ` · ${sel.tip}` : ''}` : ''}</b>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${h}`} onPointerLeave={() => setHover(null)} role="img" aria-label="bar chart">
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridl" x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} />
            <text x={L - 6} y={sy(t) + 3} textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        {band && <rect className="band" x={L} width={W - L - R} y={sy(band[1])} height={sy(band[0]) - sy(band[1])} />}
        {data.map((d, i) => {
          const x = L + i * bw + Math.max(1, bw * 0.15);
          const w = Math.max(1, bw * 0.7);
          const y = sy(d.value);
          return (
            <g key={d.key} onPointerEnter={() => setHover(i)} onClick={() => onSelect?.(d.key)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <rect x={L + i * bw} y={T} width={bw} height={h - T - B} fill="transparent" />
              <rect className={`bar ${d.cls ?? ''}`} x={x} y={y} width={w} height={Math.max(0, h - B - y)} />
              {d.target != null && <line className="target" x1={x - 1} x2={x + w + 1} y1={sy(d.target)} y2={sy(d.target)} style={{ strokeDasharray: 'none', strokeWidth: 2 }} />}
              {hover === i && <rect x={L + i * bw} y={T} width={bw} height={h - T - B} fill="none" stroke="var(--accent)" />}
            </g>
          );
        })}
        <line className="axis" x1={L} x2={W - R} y1={h - B} y2={h - B} />
        <text x={L} y={h - 5}>{data[0].label}</text>
        <text x={W - R} y={h - 5} textAnchor="end">{data[data.length - 1].label}</text>
      </svg>
    </div>
  );
}
