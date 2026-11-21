import { useEffect, useMemo, useState } from 'react';
import { limit, onSnapshot, orderBy, query, where, type Query } from 'firebase/firestore';
import { displayName, postsCol, userRef } from '../data/api';
import type { Post, UserProfile } from '../data/types';

/** Live profiles for a set of uids (self + friends). */
export function useProfiles(uids: string[]) {
  const [map, setMap] = useState<Map<string, UserProfile>>(new Map());
  const key = [...uids].sort().join(',');
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    setMap((m) => new Map([...m].filter(([k]) => ids.includes(k))));
    const unsubs = ids.map((id) => onSnapshot(userRef(id), (s) => {
      setMap((m) => {
        const n = new Map(m);
        if (s.exists()) n.set(id, s.data() as UserProfile); else n.delete(id);
        return n;
      });
    }, (e) => console.warn('profile', id, e.code)));
    return () => unsubs.forEach((u) => u());
  }, [key]);
  const names = useMemo(() => new Map([...map].map(([k, v]) => [k, displayName(v)])), [map]);
  return { profiles: map, names };
}

/**
 * Posts by an author visible to the viewer. One query per author because security
 * rules require the query to prove the viewer is allowed to read every result.
 */
function authorQuery(authorId: string, viewer: string, n: number, progressOnly: boolean): Query {
  const cons = [where('authorId', '==', authorId)];
  if (authorId !== viewer) cons.push(where('visibility', '==', 'friends'));
  if (progressOnly) cons.push(where('progress', '==', true));
  return query(postsCol(), ...cons, orderBy('createdAt', 'desc'), limit(n));
}

export function usePosts(authorIds: string[], viewer: string, pageSize: number, progressOnly = false) {
  const [byAuthor, setByAuthor] = useState<Record<string, Post[]>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const key = [...authorIds].sort().join(',');
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    setPending(new Set(ids));
    setByAuthor((m) => Object.fromEntries(Object.entries(m).filter(([k]) => ids.includes(k))));
    const unsubs = ids.map((id) => onSnapshot(
      authorQuery(id, viewer, pageSize, progressOnly),
      (snap) => {
        const posts = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } as Post));
        setByAuthor((m) => ({ ...m, [id]: posts }));
        setPending((p) => { const n = new Set(p); n.delete(id); return n; });
      },
      (e) => {
        console.warn('posts', id, e);
        setErrors((x) => [...x, `${id}: ${e.code}`]);
        setPending((p) => { const n = new Set(p); n.delete(id); return n; });
      },
    ));
    return () => unsubs.forEach((u) => u());
  }, [key, viewer, pageSize, progressOnly]);

  const posts = useMemo(() => Object.values(byAuthor).flat().sort(
    (a, b) => (b.createdAt?.toMillis?.() ?? Date.now()) - (a.createdAt?.toMillis?.() ?? Date.now()),
  ), [byAuthor]);
  // there may be more if any author returned a full page
  const hasMore = Object.values(byAuthor).some((p) => p.length >= pageSize);
  return { posts, loading: pending.size > 0 && posts.length === 0, refreshing: pending.size > 0, hasMore, errors };
}
