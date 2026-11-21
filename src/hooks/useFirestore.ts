import { useEffect, useState } from 'react';
import {
  onSnapshot, type DocumentReference, type Query, type FirestoreError,
} from 'firebase/firestore';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: FirestoreError | null;
}

/** Subscribe to a single document. `ref` should be memoised or keyed by `key`. */
export function useDoc<T>(ref: DocumentReference | null, key: string): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: !!ref, error: null });
  useEffect(() => {
    if (!ref) { setState({ data: null, loading: false, error: null }); return; }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      (snap) => setState({
        data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null,
        loading: false,
        error: null,
      }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Subscribe to a query. `q` should be keyed by `key`. */
export function useQuery<T>(q: Query | null, key: string): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: !!q, error: null });
  useEffect(() => {
    if (!q) { setState({ data: [], loading: false, error: null }); return; }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({
        data: snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } as T)),
        loading: false,
        error: null,
      }),
      (error) => {
        console.warn('query failed', key, error);
        setState({ data: [], loading: false, error });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
