function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 5×5 mirrored block avatar as an SVG data URL. */
export function generatedAvatar(seed: string): string {
  let h = hash(seed || 'x');
  const hue = h % 360;
  const fg = `hsl(${hue} 70% 45%)`;
  const cells: string[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
      if (h & 1) {
        cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
        if (x < 2) cells.push(`<rect x="${4 - x}" y="${y}" width="1" height="1"/>`);
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 6 6" shape-rendering="crispEdges"><rect x="-0.5" y="-0.5" width="6" height="6" fill="#f4f3ee"/><g fill="${fg}">${cells.join('')}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function randomId(len = 20): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}
