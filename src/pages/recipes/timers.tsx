// Cooking timers (RecipeMan: util/Timers.kt). They keep running while you move around the app,
// survive a reload (end times are kept in this browser), and ring with sound, vibration and a
// notification when the tab is in the background. Browsers can't ring once the app is closed.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatSeconds } from '../../lib/recipes/durations';
import { Icon } from '../../components/ui';

interface Timer { id: string; label: string; endsAt: number; total: number; done?: boolean }
interface Ctx { timers: Timer[]; start: (label: string, seconds: number) => void; stop: (id: string) => void }
const TimersCtx = createContext<Ctx>({ timers: [], start: () => undefined, stop: () => undefined });
const KEY = 'wefit.timers.v1';

function load(): Timer[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

function beep(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, t0 + i * 0.35); g.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.35 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25);
    o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.3);
  }
}

export function TimersProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Timer[]>(load);
  const [, tick] = useState(0);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch { /* ignore */ } }, [timers]);
  useEffect(() => {
    if (!timers.some((t) => !t.done)) return;
    const i = setInterval(() => {
      tick((n) => n + 1);
      const now = Date.now();
      setTimers((ts) => {
        let changed = false;
        const next = ts.map((t) => {
          if (t.done || t.endsAt > now) return t;
          changed = true;
          if (audio.current) beep(audio.current);
          navigator.vibrate?.([300, 150, 300, 150, 300]);
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ Timer done', { body: t.label, tag: t.id });
          }
          return { ...t, done: true };
        });
        return changed ? next : ts;
      });
    }, 500);
    return () => clearInterval(i);
  }, [timers]);

  const start = useCallback((label: string, seconds: number) => {
    // Audio must be unlocked by a user gesture (this call comes from a tap).
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* no audio */ }
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    setTimers((ts) => [...ts, { id: Math.random().toString(36).slice(2), label, endsAt: Date.now() + seconds * 1000, total: seconds }]);
  }, []);
  const stop = useCallback((id: string) => setTimers((ts) => ts.filter((t) => t.id !== id)), []);

  return (
    <TimersCtx.Provider value={{ timers, start, stop }}>
      {children}
      {timers.length > 0 && (
        <div className="timer-bar" role="status">
          {timers.map((t) => {
            const left = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
            return (
              <div key={t.id} className={`timer-chip ${t.done ? 'done' : ''}`}>
                <span>⏱</span>
                <b>{t.done ? 'Done!' : formatSeconds(left)}</b>
                <span className="trunc small" style={{ maxWidth: 120 }}>{t.label}</span>
                <button className="icon-btn" style={{ width: 26, height: 26, color: 'inherit' }} onClick={() => stop(t.id)} aria-label={t.done ? 'Dismiss timer' : 'Cancel timer'}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </TimersCtx.Provider>
  );
}

export const useTimers = () => useContext(TimersCtx);
