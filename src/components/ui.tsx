import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ActionState } from '../hooks/useAction';
import { generatedAvatar } from '../lib/avatar';
import type { UserProfile } from '../data/types';

// ───────────────────────── spinner (text frames, monospace-safe)
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export function Spinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return <span className="spin" aria-hidden>{FRAMES[i]}</span>;
}

// ───────────────────────── async button
interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  state?: ActionState;
  children: ReactNode;
  pendingLabel?: ReactNode;
  doneLabel?: ReactNode;
  errorLabel?: ReactNode;
  variant?: 'primary' | 'accent' | 'ghost' | 'danger' | '';
  size?: 'sm' | 'lg' | '';
  block?: boolean;
}

export function ActionButton({
  state = 'idle', children, pendingLabel, doneLabel = 'DONE', errorLabel = 'RETRY',
  variant = '', size = '', block, className = '', disabled, ...rest
}: ActionButtonProps) {
  const content =
    state === 'pending' ? <span><Spinner /> {pendingLabel ?? children}</span>
      : state === 'done' ? <span>✓ {doneLabel}</span>
        : state === 'error' ? <span>✕ {errorLabel}</span>
          : <span>{children}</span>;
  return (
    <button
      type="button"
      {...rest}
      data-state={state}
      aria-busy={state === 'pending'}
      disabled={disabled || state === 'pending'}
      className={`btn ${variant} ${size} ${block ? 'block' : ''} ${className}`}
    >
      {content}
    </button>
  );
}

// ───────────────────────── skeletons & empty states
export function Skeleton({ h = 64, label = 'LOADING', className = '' }: { h?: number; label?: string; className?: string }) {
  return (
    <div className={`sk ${className}`} style={{ height: h }} role="status" aria-label={label}>
      <span className="sk-label cursor">{label}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="err" role="alert">{children}</div>;
}

// ───────────────────────── panel
export function Panel({
  title, idx, right, children, footer, tight, className = '',
}: {
  title: ReactNode; idx?: string; right?: ReactNode; children: ReactNode;
  footer?: ReactNode; tight?: boolean; className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-h">
        {idx && <span className="idx">{idx}</span>}
        <span className="t">{title}</span>
        <span className="sp" />
        {right}
      </header>
      <div className={`panel-b ${tight ? 'tight' : ''}`}>{children}</div>
      {footer && <footer className="panel-f">{footer}</footer>}
    </section>
  );
}

// ───────────────────────── controls
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" className={`tgl ${on ? 'on' : ''}`} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="box" />
      {label ?? (on ? 'ON' : 'OFF')}
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

/** Shows PUBLIC / PRIVATE. On your own profile it is a toggle. */
export function VisBadge({ pub, onToggle, state }: { pub: boolean; onToggle?: () => void; state?: ActionState }) {
  const label = pub ? '◉ FRIENDS' : '○ PRIVATE';
  if (!onToggle) return <span className={`vis ${pub ? 'pub' : 'priv'}`}>{label}</span>;
  return (
    <button
      type="button"
      className={`vis ${pub ? 'pub' : 'priv'}`}
      data-state={state}
      title={pub ? 'Visible to friends — tap to make private' : 'Only you — tap to share with friends'}
      onClick={onToggle}
    >
      {state === 'pending' ? '… SAVING' : label}
    </button>
  );
}

export function Meter({
  value, max, cls = '', band, ticks = [], lg,
}: { value: number; max: number; cls?: string; band?: [number, number]; ticks?: number[]; lg?: boolean }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / (max || 1)) * 100))}%`;
  return (
    <div className={`meter ${lg ? 'lg' : ''}`} role="meter" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)}>
      {band && <span className="band" style={{ left: pct(band[0]), width: `calc(${pct(band[1])} - ${pct(band[0])})` }} />}
      <i className={cls} style={{ width: pct(value) }} />
      {ticks.map((t) => <span key={t} className="tick" style={{ left: pct(t) }} />)}
    </div>
  );
}

export function UploadProgress({ pct, label = 'UPLOAD' }: { pct: number; label?: string }) {
  return (
    <div className="prog" role="progressbar" aria-valuenow={Math.round(pct)}>
      <span>{label}</span>
      <Meter value={pct} max={100} cls="accent" />
      <span className="nowrap">{String(Math.round(pct)).padStart(3, ' ')}%</span>
    </div>
  );
}

// ───────────────────────── avatar
export function Avatar({ p, size = 32 }: { p: Pick<UserProfile, 'photoURL' | 'avatarMode' | 'avatarSeed' | 'uid'> | null | undefined; size?: number }) {
  const photo = p?.avatarMode === 'photo' && p.photoURL;
  const src = photo ? p!.photoURL! : generatedAvatar(p?.avatarSeed || p?.uid || '');
  return (
    <img
      className={`av ${photo ? '' : 'gen'}`}
      src={src}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
    />
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
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
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
interface ToastItem { id: number; msg: ReactNode; kind: 'ok' | 'bad' | 'info'; ms: number; leaving?: boolean }
const ToastCtx = createContext<(msg: ReactNode, kind?: ToastItem['kind'], ms?: number) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((msg: ReactNode, kind: ToastItem['kind'] = 'ok', ms = 2600) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, msg, kind, ms }]);
    setTimeout(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x))), ms);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms + 170);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.kind} ${t.leaving ? 'leave' : ''}`}>
              <span className="mk">{t.kind === 'bad' ? '✕' : t.kind === 'ok' ? '✓' : '›'}</span>
              <span className="grow">{t.msg}</span>
              <span className="life" style={{ animationDuration: `${t.ms}ms` }} />
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
  value, onChange, unit, step = 'any', min, placeholder, ariaLabel, autoFocus,
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
      step={step}
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
