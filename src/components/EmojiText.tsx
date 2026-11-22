import { createPortal } from 'react-dom';
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref, type TextareaHTMLAttributes,
} from 'react';
import { useSession } from '../hooks/useSession';
import { findStd, searchEmoji, type EmojiSuggestion } from '../lib/emojiList';

const CODE_RE = /:([a-z0-9_+-]{1,32}):/gi;

/** Renders text, turning :shortcodes: into emojis (custom ones as images). Unknown codes stay as typed. */
export function EmojiText({ text }: { text: string }) {
  const { emojis } = useSession();
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CODE_RE)) {
    const name = m[1].toLowerCase();
    const custom = emojis.get(name);
    const std = custom ? undefined : findStd(name);
    if (!custom && !std) continue;
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(custom
      ? <img key={i} className="emoji-inline" src={custom.url} alt={`:${name}:`} title={`:${name}:`} />
      : std!.c);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

type FieldEl = HTMLInputElement | HTMLTextAreaElement;
interface Query { start: number; end: number; q: string }

/** The ":abc" being typed right before the caret, if any. */
function activeQuery(text: string, caret: number): Query | null {
  const m = /(^|[\s(])(:([a-z0-9_+-]{2,32}))$/i.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length, end: caret, q: m[3].toLowerCase() };
}

type BaseProps = { value: string; onChange: (v: string) => void; onEnter?: () => void };
type Props =
  | (BaseProps & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>)
  | (BaseProps & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>);

/**
 * Text input / textarea with Slack-style emoji entry:
 * - typing ":fi" opens suggestions (↑/↓ to move, Enter/Tab to pick, Esc to close)
 * - typing a complete ":fire:" turns it into 🔥
 * - custom emojis are inserted as ":name:" and shown as images wherever the text is displayed
 */
export function EmojiField(props: Props) {
  const { value, onChange, onEnter, multiline, ...rest } = props;
  const { emojis } = useSession();
  const ref = useRef<FieldEl>(null);
  const caretAfter = useRef<number | null>(null);
  const [query, setQuery] = useState<Query | null>(null);
  const [idx, setIdx] = useState(0);
  const names = useMemo(() => [...emojis.keys()], [emojis]);
  const suggestions = useMemo(() => (query ? searchEmoji(query.q, names) : []), [query, names]);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const open = suggestions.length > 0;

  // Float the list over the page (cards clip their contents); flip above when there's no room below.
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const below = vh - r.bottom;
      setPos(below >= 220 || below >= r.top
        ? { left: r.left, width: r.width, top: r.bottom + 4 }
        : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [open, value]);

  // Put the caret back where it belongs after we rewrite the value.
  useLayoutEffect(() => {
    if (caretAfter.current != null && ref.current) {
      ref.current.setSelectionRange(caretAfter.current, caretAfter.current);
      caretAfter.current = null;
    }
  }, [value]);

  const update = (text: string, caret: number) => {
    // A just-completed standard ":code:" becomes the emoji itself.
    const done = /:([a-z0-9_+-]{1,32}):$/i.exec(text.slice(0, caret));
    const std = done && !emojis.has(done[1].toLowerCase()) ? findStd(done[1]) : undefined;
    if (done && std) {
      const start = caret - done[0].length;
      text = text.slice(0, start) + std.c + text.slice(caret);
      caret = start + std.c.length;
      caretAfter.current = caret;
    }
    onChange(text);
    setQuery(activeQuery(text, caret));
    setIdx(0);
  };

  const pick = (s: EmojiSuggestion) => {
    if (!query) return;
    const insert = `${s.key} `;
    const next = value.slice(0, query.start) + insert + value.slice(query.end);
    caretAfter.current = query.start + insert.length;
    onChange(next);
    setQuery(null);
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<FieldEl>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[idx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return; }
    }
    if (e.key === 'Enter' && !multiline && onEnter) onEnter();
  };

  const common = {
    value,
    onKeyDown,
    onChange: (e: { target: FieldEl }) => update(e.target.value, e.target.selectionStart ?? e.target.value.length),
    onSelect: (e: { currentTarget: FieldEl }) => {
      const el = e.currentTarget;
      if (el.selectionStart !== el.selectionEnd) { setQuery(null); return; }
      setQuery(activeQuery(el.value, el.selectionStart ?? 0));
    },
    onBlur: () => setTimeout(() => setQuery(null), 150),
    'aria-autocomplete': 'list' as const,
    'aria-expanded': suggestions.length > 0,
  };

  return (
    <div className="emoji-field">
      {multiline
        ? <textarea ref={ref as Ref<HTMLTextAreaElement>} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...common} />
        : <input ref={ref as Ref<HTMLInputElement>} {...(rest as InputHTMLAttributes<HTMLInputElement>)} {...common} />}
      {open && pos && createPortal(
        <div className="emoji-suggest" role="listbox" style={{ left: pos.left, width: Math.max(220, pos.width), top: pos.top, bottom: pos.bottom }}>
          {suggestions.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="option"
              aria-selected={i === idx}
              className={i === idx ? 'on' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setIdx(i)}
              onClick={() => pick(s)}
            >
              <span className="ico">
                {s.custom ? <img className="emoji-img" src={emojis.get(s.code)?.url} alt="" /> : <span className="emoji-char">{s.key}</span>}
              </span>
              <span>:{s.code}:</span>
              {s.custom && <span className="small muted" style={{ marginLeft: 'auto' }}>custom</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
