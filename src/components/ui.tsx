import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ActionState } from '../hooks/useAction';
import { generatedAvatar } from '../lib/avatar';
import type { UserProfile } from '../data/types';

// ───────────────────────── icons (simple line icons)
const PATHS: Record<string, string> = {
  feed: 'M4 5h16M4 12h16M4 19h10',
  diary: 'M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM6 3v18M10 8h5M10 12h5',
  move: 'M3 12h4l3-8 4 16 3-8h4',
  friends: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3',
  me: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21a8 8 0 0 1 16 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  close: 'M6 6l12 12M18 6L6 18',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
};

export function Icon({ name, size = 22, stroke = 1.9 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

// ───────────────────────── async button
interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  state?: ActionState;
  children: ReactNode;
  pendingLabel?: ReactNode;
  doneLabel?: ReactNode;
  errorLabel?: ReactNode;
  variant?: 'primary' | 'accent' | 'ghost' | 'danger' | 'soft' | '';
  size?: 'sm' | 'lg' | '';
  block?: boolean;
}

/** Button with visible pending → done/error states. */
export function ActionButton({
  state = 'idle', children, pendingLabel, doneLabel = 'Done', errorLabel = 'Try again',
  variant = '', size = '', block, className = '', disabled, ...rest
}: ActionButtonProps) {
  const content =
    state === 'pending' ? <><Spinner /> {pendingLabel ?? children}</>
      : state === 'done' ? <><span className="check">✓</span> {doneLabel}</>
        : state === 'error' ? <>{errorLabel}</>
          : children;
  const v = variant === 'accent' ? 'primary' : variant;
  return (
    <button
      type="button"
      {...rest}
      data-state={state}
      aria-busy={state === 'pending'}
      disabled={disabled || state === 'pending'}
      className={`btn ${v} ${size} ${block ? 'block' : ''} ${className}`}
    >
      {content}
    </button>
  );
}

// ───────────────────────── loading & empty
export function Skeleton({ h = 64, label = 'Loading', className = '' }: { h?: number; label?: string; className?: string }) {
  return <div className={`sk ${className}`} style={{ height: h }} role="status" aria-label={label} />;
}

export function Empty({ title, icon, children }: { title: string; icon?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <span className="ico">{icon}</span>}
      <b>{title}</b>
      {children}
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="err" role="alert">{children}</div>;
}

// ───────────────────────── card
export function Panel({
  title, right, children, footer, tight, className = '',
}: {
  title?: ReactNode; idx?: string; right?: ReactNode; children: ReactNode;
  footer?: ReactNode; tight?: boolean; className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="panel-h">
          <span className="t">{title}</span>
          <span className="sp" />
          {right}
        </header>
      )}
      <div className={`panel-b ${tight ? 'tight' : ''}`}>{children}</div>
      {footer && <footer className="panel-f">{footer}</footer>}
    </section>
  );
}

// ───────────────────────── controls
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" className={`tgl ${on ? 'on' : ''}`} aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="box" />
      {label}
    </button>
  );
}

export function Seg<T extends string>({
  value, options, onChange, block,
}: { value: T; options: { v: T; l: ReactNode }[]; onChange: (v: T) => void; block?: boolean }) {
  return (
    <div className={`seg ${block ? 'block' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

/** "Friends" / "Private" pill. On your own profile it toggles. */
export function VisBadge({ pub, onToggle, state }: { pub: boolean; onToggle?: () => void; state?: ActionState }) {
  const label = state === 'pending' ? 'Saving…' : pub ? 'Friends' : 'Private';
  const icon = pub ? '👥' : '🔒';
  if (!onToggle) return <span className={`vis ${pub ? 'pub' : ''}`}>{icon} {label}</span>;
  return (
    <button
      type="button"
      className={`vis ${pub ? 'pub' : ''}`}
      data-state={state}
      title={pub ? 'Visible to friends — tap to make private' : 'Only you — tap to share with friends'}
      onClick={onToggle}
    >
      {icon} {label}
    </button>
  );
}

export function Meter({
  value, max, cls = '', band, ticks = [], lg, color,
}: { value: number; max: number; cls?: string; band?: [number, number]; ticks?: number[]; lg?: boolean; color?: string }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / (max || 1)) * 100))}%`;
  return (
    <div className={`meter ${lg ? 'lg' : ''}`} role="meter" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)}>
      {band && <span className="band" style={{ left: pct(band[0]), width: `calc(${pct(band[1])} - ${pct(band[0])})` }} />}
      <i className={cls} style={{ width: pct(value), ...(color ? { background: color } : {}) }} />
      {ticks.map((t) => <span key={t} className="tick" style={{ left: pct(t) }} />)}
    </div>
  );
}

/** Circular progress ring. */
export function Ring({ value, max, color, label, sub, caption }: { value: number; max: number; color: string; label: ReactNode; sub?: ReactNode; caption?: ReactNode }) {
  const r = 41, c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / (max || 1)));
  return (
    <div>
      <div className="ring">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle className="trk" cx="48" cy="48" r={r} />
          <circle className="val" cx="48" cy="48" r={r} stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
        </svg>
        <div className="lbl"><b>{label}</b>{sub && <span>{sub}</span>}</div>
      </div>
      {caption && <div className="ring-cap">{caption}</div>}
    </div>
  );
}

export function UploadProgress({ pct, label = 'Uploading' }: { pct: number; label?: string }) {
  return (
    <div className="prog" role="progressbar" aria-valuenow={Math.round(pct)}>
      <span>{label}</span>
      <Meter value={pct} max={100} cls="accent" />
      <span className="nowrap">{Math.round(pct)}%</span>
    </div>
  );
}

// ───────────────────────── avatar
type AvatarSource = Pick<UserProfile, 'photoURL' | 'avatarMode' | 'avatarSeed' | 'uid'> & Partial<Pick<UserProfile, 'nickname' | 'displayName'>>;

export function Avatar({ p, size = 32 }: { p: AvatarSource | null | undefined; size?: number }) {
  const photo = p?.avatarMode === 'photo' && p.photoURL;
  const name = p?.nickname || p?.displayName || '';
  const src = photo ? p!.photoURL! : generatedAvatar(p?.avatarSeed || p?.uid || '', name);
  return (
    <img className="av" src={src} width={size} height={size} style={{ width: size, height: size }} alt="" referrerPolicy="no-referrer" loading="lazy" />
  );
}

// ───────────────────────── modal
export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-h">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>
        <div className="modal-b">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Photo">
      <img src={src} alt="" />
    </div>,
    document.body,
  );
}

// ───────────────────────── toasts
interface ToastItem { id: number; msg: ReactNode; kind: 'ok' | 'bad' | 'info'; leaving?: boolean }
const ToastCtx = createContext<(msg: ReactNode, kind?: ToastItem['kind'], ms?: number) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((msg: ReactNode, kind: ToastItem['kind'] = 'ok', ms = 2600) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, msg, kind }]);
    setTimeout(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x))), ms);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms + 170);
  }, []);
  useEffect(() => {
    const onFail = (e: Event) => push(`Couldn't save ${(e as CustomEvent<string>).detail}. Check your connection and try again.`, 'bad', 5000);
    window.addEventListener('wefit:write-error', onFail);
    return () => window.removeEventListener('wefit:write-error', onFail);
  }, [push]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.kind} ${t.leaving ? 'leave' : ''}`}>
              <span className="mk">{t.kind === 'bad' ? '✕' : t.kind === 'ok' ? '✓' : 'i'}</span>
              <span>{t.msg}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Numeric input that keeps a free-typed string and reports parsed numbers. */
export function NumInput({
  value, onChange, unit, min, placeholder, ariaLabel, autoFocus,
}: {
  value: number | ''; onChange: (v: number | '') => void; unit?: string; step?: string;
  min?: number; placeholder?: string; ariaLabel?: string; autoFocus?: boolean;
}) {
  const [text, setText] = useState(value === '' ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === '' ? '' : String(value));
    }
  }, [value]);
  const input = (
    <input
      className="num"
      inputMode="decimal"
      type="text"
      value={text}
      min={min}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={(e) => {
        const t = e.target.value.replace(',', '.');
        setText(t);
        const n = parseFloat(t);
        const v = t.trim() === '' || !Number.isFinite(n) ? '' : n;
        last.current = v;
        onChange(v);
      }}
    />
  );
  if (!unit) return input;
  return <div className="unit-input">{input}<span className="u">{unit}</span></div>;
}
