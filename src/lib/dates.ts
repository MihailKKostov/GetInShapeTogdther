const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date key, YYYY-MM-DD. */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000);
}

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function fmtDay(key: string): string {
  const d = parseKey(key);
  const today = dateKey();
  if (key === today) return 'TODAY';
  if (key === addDays(today, -1)) return 'YESTERDAY';
  return `${WD[d.getDay()]} ${pad(d.getDate())} ${MO[d.getMonth()]}`;
}

export function fmtShort(d: Date): string {
  return `${pad(d.getDate())} ${MO[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relTime(d: Date | null | undefined): string {
  if (!d) return 'NOW';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'NOW';
  if (s < 3600) return `${Math.round(s / 60)}M AGO`;
  if (s < 86400) return `${Math.round(s / 3600)}H AGO`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}D AGO`;
  return fmtShort(d);
}

export function fmtDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function toLocalInput(d: Date): string {
  return `${dateKey(d)}T${fmtTime(d)}`;
}
