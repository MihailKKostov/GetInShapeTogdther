import { decodeRoute, projectRoute, type GeoPoint } from '../lib/geo';
import { useWidth } from './Charts';

/** Schematic route rendering — no map tiles, just the line on a grid with a scale bar. */
export function RouteTrace({ route, points, h = 200, live }: { route?: number[]; points?: GeoPoint[]; h?: number; live?: boolean }) {
  const pts = points ?? decodeRoute(route);
  const [box, W] = useWidth(600);
  if (pts.length < 2) {
    return (
      <div ref={box}>
        <svg className="route" viewBox={`0 0 ${W} ${h}`}>
          <text x={W / 2} y={h / 2} textAnchor="middle">{live ? 'WAITING FOR GPS FIX…' : 'NO ROUTE'}</text>
        </svg>
      </div>
    );
  }
  const { d, start, end, scaleM, scalePx } = projectRoute(pts, W, h, 18);
  const grid = [];
  for (let x = 0; x <= W; x += 24) grid.push(<line key={`x${x}`} className="g" x1={x} x2={x} y1={0} y2={h} />);
  for (let y = 0; y <= h; y += 24) grid.push(<line key={`y${y}`} className="g" x1={0} x2={W} y1={y} y2={y} />);
  return (
    <div ref={box}>
    <svg className="route" viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Route">
      {grid}
      <path className={`trace ${live ? 'live' : ''}`} d={d} />
      {start && <rect className="s" x={start[0] - 4} y={start[1] - 4} width={8} height={8} />}
      {end && <rect className="e" x={end[0] - 4} y={end[1] - 4} width={8} height={8} />}
      <g transform={`translate(10 ${h - 12})`}>
        <line className="scale" x1={0} x2={scalePx} y1={0} y2={0} />
        <line className="scale" x1={0} x2={0} y1={-4} y2={2} />
        <line className="scale" x1={scalePx} x2={scalePx} y1={-4} y2={2} />
        <text x={scalePx + 6} y={3}>{scaleM >= 1000 ? `${scaleM / 1000} KM` : `${scaleM} M`}</text>
      </g>
      <text x={W - 8} y={14} textAnchor="end">N ↑</text>
    </svg>
    </div>
  );
}
