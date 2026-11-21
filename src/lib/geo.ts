export interface GeoPoint {
  lat: number;
  lng: number;
  ele?: number;
  t?: number;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathDistance(pts: GeoPoint[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
  return d;
}

/** Elevation gain with a small hysteresis to ignore GPS noise. */
export function elevationGain(pts: GeoPoint[], threshold = 3): number {
  let gain = 0;
  let ref: number | undefined;
  for (const p of pts) {
    if (p.ele == null) continue;
    if (ref == null) { ref = p.ele; continue; }
    const diff = p.ele - ref;
    if (diff >= threshold) { gain += diff; ref = p.ele; }
    else if (diff <= -threshold) ref = p.ele;
  }
  return Math.round(gain);
}

function perpDist(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const k = Math.cos(rad(a.lat));
  const x = (p.lng - a.lng) * k, y = p.lat - a.lat;
  const dx = (b.lng - a.lng) * k, dy = b.lat - a.lat;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(x, y);
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / len));
  return Math.hypot(x - t * dx, y - t * dy);
}

/** Ramer–Douglas–Peucker, tolerance in degrees. */
function rdp(pts: GeoPoint[], eps: number): GeoPoint[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplify to at most `max` points and flatten to [lat,lng,...] rounded to ~1 m. */
export function encodeRoute(pts: GeoPoint[], max = 600): number[] {
  let eps = 0.00001;
  let out = rdp(pts, eps);
  while (out.length > max) { eps *= 1.8; out = rdp(pts, eps); }
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  return out.flatMap((p) => [r(p.lat), r(p.lng)]);
}

export function decodeRoute(flat: number[] | undefined): GeoPoint[] {
  const out: GeoPoint[] = [];
  if (!flat) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ lat: flat[i], lng: flat[i + 1] });
  return out;
}

export interface ParsedTrack {
  name?: string;
  points: GeoPoint[];
  startedAt?: Date;
  durationSec: number;
  distanceM: number;
  elevationM: number;
}

export function parseGpx(xml: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a valid GPX file');
  const nodes = Array.from(doc.getElementsByTagName('trkpt'));
  const fallback = nodes.length ? nodes : Array.from(doc.getElementsByTagName('rtept'));
  const points: GeoPoint[] = fallback.map((n) => {
    const ele = n.getElementsByTagName('ele')[0]?.textContent;
    const time = n.getElementsByTagName('time')[0]?.textContent;
    return {
      lat: parseFloat(n.getAttribute('lat') || ''),
      lng: parseFloat(n.getAttribute('lon') || ''),
      ele: ele ? parseFloat(ele) : undefined,
      t: time ? Date.parse(time) : undefined,
    };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (points.length < 2) throw new Error('GPX file has no track points');
  const times = points.map((p) => p.t).filter((t): t is number => t != null && Number.isFinite(t));
  const name = doc.getElementsByTagName('name')[0]?.textContent ?? undefined;
  return {
    name: name || undefined,
    points,
    startedAt: times.length ? new Date(times[0]) : undefined,
    durationSec: times.length > 1 ? Math.round((times[times.length - 1] - times[0]) / 1000) : 0,
    distanceM: Math.round(pathDistance(points)),
    elevationM: elevationGain(points),
  };
}

/** Project a route into an SVG box, preserving aspect ratio. */
export function projectRoute(pts: GeoPoint[], w: number, h: number, pad = 8) {
  if (pts.length < 2) return { d: '', start: null, end: null, scaleM: 0, scalePx: 0 };
  const k = Math.cos(rad(pts.reduce((s, p) => s + p.lat, 0) / pts.length));
  const xs = pts.map((p) => p.lng * k), ys = pts.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const s = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * s) / 2, oy = (h - spanY * s) / 2;
  const P = pts.map((_, i) => [ox + (xs[i] - minX) * s, h - (oy + (ys[i] - minY) * s)] as const);
  const d = P.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  // Scale bar: metres per pixel, rounded to a nice number.
  const mPerPx = (1 / s) * 111320;
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const target = mPerPx * (w * 0.25);
  const scaleM = nice.find((n) => n >= target) ?? nice[nice.length - 1];
  return { d, start: P[0], end: P[P.length - 1], scaleM, scalePx: scaleM / mPerPx };
}
