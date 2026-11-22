// ISO-8601 durations and cooking timers found in directions.
// Ported from RecipeMan (parse/Durations.kt).

const ISO = /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

/** Converts ISO-8601 durations like "PT1H30M" into "1 hr 30 mins". Other strings are returned trimmed. */
export function humanizeDuration(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  const m = ISO.exec(v);
  if (!m) return v;
  let total = Math.floor((Number(m[1] ?? 0) * 24 * 60) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0));
  if (total <= 0) return '';
  const parts: string[] = [];
  const d = Math.floor(total / (24 * 60)); total %= 24 * 60;
  const h = Math.floor(total / 60); const min = total % 60;
  if (d > 0) parts.push(`${d} ${d === 1 ? 'day' : 'days'}`);
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hr' : 'hrs'}`);
  if (min > 0) parts.push(`${min} ${min === 1 ? 'min' : 'mins'}`);
  return parts.join(' ');
}

export interface TimerMatch { start: number; end: number; seconds: number; label: string }

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, sixty: 60,
};

const TIME_RE = new RegExp(
  '\\b(\\d+(?:[.,]\\d+)?|½|a half|an|a|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five|forty|sixty)'
  + '(?:\\s*(?:-|–|—|to|or)\\s*(\\d+(?:[.,]\\d+)?))?'
  + '(\\s*(?:and a half|½))?'
  + '\\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\\b'
  + '(\\s+and a half\\b)?',
  'gi',
);

/** Finds durations inside free text (e.g. "bake for 25-30 minutes") so they can become tappable timers. */
export function findTimers(text: string): TimerMatch[] {
  const out: TimerMatch[] = [];
  for (const m of text.matchAll(TIME_RE)) {
    const first = m[1].toLowerCase();
    let n = first === '½' || first === 'a half' ? 0.5 : Number(first.replace(',', '.'));
    if (!Number.isFinite(n)) n = WORD_NUMBERS[first];
    if (n == null || !Number.isFinite(n)) continue;
    if (m[3]?.trim() || m[5]?.trim()) n += 0.5;
    const unit = m[4].toLowerCase();
    const mult = unit.startsWith('h') ? 3600 : unit.startsWith('m') ? 60 : 1;
    const secs = Math.floor(n * mult);
    if (secs <= 0 || secs > 72 * 3600) continue;
    const start = m.index ?? 0;
    out.push({ start, end: start + m[0].length, seconds: secs, label: m[0].trim() });
  }
  return out;
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
