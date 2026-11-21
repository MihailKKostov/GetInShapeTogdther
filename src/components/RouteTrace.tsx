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
          <text x={W / 2} y={h / 2} textAnchor="middle">{live ? 'Waiting for GPS…' : 'No route'}</text>
        </svg>
      </div>
    );
  }
  const { d, start, end, scaleM, scalePx } = projectRoute(pts, W, h, 18);
  const grid = [];
  for (let x = 0; x <= W; x += 40) grid.push(<line key={`x${x}`} className="g" x1={x} x2={x} y1={0} y2={h} />);
  for (let y = 0; y <= h; y += 40) grid.push(<line key={`y${y}`} className="g" x1={0} x2={W} y1={y} y2={y} />);
  return (
    <div ref={box}>
    <svg className="route" viewBox={`0 0 ${W} ${h}`} role="img" aria-label="Route">
      {grid}
      <path className={`trace ${live ? 'live' : ''}`} d={d} />
      {start && <circle className="s" cx={start[0]} cy={start[1]} r={6} />}
      {end && <circle className="e" cx={end[0]} cy={end[1]} r={6} />}
      <g transform={`translate(10 ${h - 12})`}>
        <line className="scale" x1={0} x2={scalePx} y1={0} y2={0} />
        <line className="scale" x1={0} x2={0} y1={-4} y2={2} />
        <line className="scale" x1={scalePx} x2={scalePx} y1={-4} y2={2} />
        <text x={scalePx + 6} y={3}>{scaleM >= 1000 ? `${scaleM / 1000} km` : `${scaleM} m`}</text>
      </g>
    </svg>
    </div>
  );
}
