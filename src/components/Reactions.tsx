import { useMemo, useRef, useState } from 'react';
import { query } from 'firebase/firestore';
import { reactionsCol, toggleReaction } from '../data/api';
import type { ReactionDoc } from '../data/types';
import { useQuery } from '../hooks/useFirestore';
import { useSession } from '../hooks/useSession';
import { QUICK_REACTIONS } from '../lib/emojiList';
import { Emoji, EmojiPicker } from './Emoji';
import { useToast } from './ui';

/**
 * Emoji reactions. Each user owns one doc with their list of emojis.
 * Taps are applied optimistically (instant acknowledgement); the count bumps when it changes.
 */
export function Reactions({ postId, names }: { postId: string; names: Map<string, string> }) {
  const { user } = useSession();
  const uid = user!.uid;
  const toast = useToast();
  const live = useQuery<ReactionDoc & { id: string }>(query(reactionsCol(postId)), `rx:${postId}`);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [pickerFor, setPickerFor] = useState<HTMLElement | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const groups = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const d of live.data) for (const e of d.emojis ?? []) {
      if (!m.has(e)) m.set(e, new Set());
      m.get(e)!.add(d.uid);
    }
    for (const [e, on] of Object.entries(optimistic)) {
      if (!m.has(e)) m.set(e, new Set());
      if (on) m.get(e)!.add(uid); else m.get(e)!.delete(uid);
    }
    return [...m.entries()].filter(([, s]) => s.size > 0);
  }, [live.data, optimistic, uid]);

  const mine = new Set(groups.filter(([, s]) => s.has(uid)).map(([e]) => e));

  const toggle = async (e: string) => {
    const on = !mine.has(e);
    setOptimistic((o) => ({ ...o, [e]: on }));
    try {
      await toggleReaction(postId, uid, e, on);
    } catch (err) {
      console.error(err);
      toast('Reaction failed — check connection', 'bad');
    } finally {
      setOptimistic((o) => { const n = { ...o }; delete n[e]; return n; });
    }
  };

  const showQuick = groups.length === 0;

  return (
    <div className="reacts">
      {groups.map(([e, s]) => (
        <button
          key={e}
          type="button"
          className={`rx ${s.has(uid) ? 'mine' : ''}`}
          onClick={() => toggle(e)}
          title={[...s].map((u) => (u === uid ? 'you' : names.get(u) ?? 'friend')).join(', ')}
        >
          <Emoji k={e} />
          <span key={s.size} className="c bump">{s.size}</span>
        </button>
      ))}
      {showQuick && QUICK_REACTIONS.map((e) => (
        <button key={e} type="button" className="rx add" onClick={() => toggle(e)} title="React">
          <Emoji k={e} />
        </button>
      ))}
      <button
        ref={addRef}
        type="button"
        className="rx add"
        aria-label="Add reaction"
        onClick={() => setPickerFor((p) => (p ? null : addRef.current))}
      >
        ☺+
      </button>
      {pickerFor && (
        <EmojiPicker
          anchor={pickerFor}
          selected={[...mine]}
          onPick={(e) => { toggle(e); setPickerFor(null); }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
