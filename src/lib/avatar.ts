function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const COLORS = ['#f26b3a', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#dc2626', '#4f46e5', '#059669'];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const a = parts[0][0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

/** Coloured circle with initials, as an SVG data URL. */
export function generatedAvatar(seed: string, name = ''): string {
  const bg = COLORS[hash(seed || 'x') % COLORS.length];
  const text = initials(name || '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="Inter,system-ui,sans-serif" font-size="${text.length > 1 ? 24 : 28}" font-weight="600" fill="#fff">${text.replace(/[<&>]/g, '')}</text></svg>`;
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
