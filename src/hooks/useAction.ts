import { useCallback, useEffect, useRef, useState } from 'react';

export type ActionState = 'idle' | 'pending' | 'done' | 'error';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps an async action with explicit, visible states.
 * - pending is held for at least `minPending` ms so the input is visibly acknowledged
 * - done is held for `doneFor` ms to close the feedback loop, then returns to idle
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  { minPending = 380, doneFor = 1100 }: { minPending?: number; doneFor?: number } = {},
) {
  const [state, setState] = useState<ActionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setState('pending');
    setError(null);
    const t0 = performance.now();
    try {
      const r = await fnRef.current(...args);
      const left = minPending - (performance.now() - t0);
      if (left > 0) await sleep(left);
      if (!alive.current) return r;
      setState('done');
      setTimeout(() => alive.current && setState((s) => (s === 'done' ? 'idle' : s)), doneFor);
      return r;
    } catch (e) {
      console.error(e);
      const left = minPending - (performance.now() - t0);
      if (left > 0) await sleep(left);
      if (!alive.current) return undefined;
      setError(e instanceof Error ? e.message.replace(/^Firebase: /, '') : String(e));
      setState('error');
      return undefined;
    }
  }, [minPending, doneFor]);

  return { run, state, error, reset: () => setState('idle') };
}
