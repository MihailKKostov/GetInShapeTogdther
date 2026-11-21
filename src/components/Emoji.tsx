import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { ALL_STD, EMOJI_GROUPS, customName, isCustom } from '../lib/emojiList';

export function Emoji({ k }: { k: string }) {
  const { emojis } = useSession();
  if (isCustom(k)) {
    const e = emojis.get(customName(k));
    if (!e) return <span className="small muted" title="deleted emoji">{k}</span>;
    return <img className="emoji-img" src={e.url} alt={k} title={k} loading="lazy" />;
  }
  return <span className="emoji-char" role="img">{k}</span>;
}

/** Popover emoji picker anchored to an element. */
export function EmojiPicker({
  anchor, onPick, onClose, selected = [],
}: { anchor: HTMLElement; onPick: (k: string) => void; onClose: () => void; selected?: string[] }) {
  const { emojis } = useSession();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 24);
    const h = 380;
    let left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 70) top = Math.max(12, r.top - h - 6);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); };
  }, [anchor, onClose]);

  const term = q.trim().toLowerCase();
  const custom = [...emojis.values()].filter((e) => !term || e.name.includes(term));
  const sections: { id: string; items: ReactNode[] }[] = [];
  const btn = (k: string, title: string, inner: ReactNode) => (
    <button key={k} type="button" title={title} className={selected.includes(k) ? 'on' : ''} onClick={() => onPick(k)}>
      {inner}
    </button>
  );
  if (custom.length) {
    sections.push({
      id: 'custom',
      items: custom.map((e) => btn(`:${e.name}:`, `:${e.name}:`, <img className="emoji-img" src={e.url} alt={e.name} />)),
    });
  }
  if (term) {
    const hits = ALL_STD.filter((e) => e.n.includes(term));
    sections.push({ id: 'results', items: hits.map((e) => btn(e.c, e.n, <span className="emoji-char">{e.c}</span>)) });
  } else {
    for (const g of EMOJI_GROUPS) {
      sections.push({ id: g.id, items: g.items.map((e) => btn(e.c, e.n, <span className="emoji-char">{e.c}</span>)) });
    }
  }

  return createPortal(
    <div className="popover" style={pos} ref={ref}>
      <div className="picker" role="dialog" aria-label="Pick emoji">
        <div style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
          <input autoFocus placeholder="Search emoji" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="picker-grid">
          {sections.map((s) => (
            <SectionFrag key={s.id} id={s.id} items={s.items} />
          ))}
          {sections.every((s) => !s.items.length) && <div className="picker-sec">No match</div>}
        </div>
        <div style={{ borderTop: '1px solid var(--line)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }} className="small">
          <span className="muted">{emojis.size} custom</span>
          <Link to="/emojis" onClick={onClose}>+ Create emoji</Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SectionFrag({ id, items }: { id: string; items: ReactNode[] }) {
  if (!items.length) return null;
  return (
    <>
      <div className="picker-sec">{id}</div>
      {items}
    </>
  );
}
