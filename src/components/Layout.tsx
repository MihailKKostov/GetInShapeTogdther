import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { Avatar } from './ui';

const TABS = [
  { to: '/', ico: '▤', l: 'FEED', end: true },
  { to: '/log', ico: '◫', l: 'LOG' },
  { to: '/move', ico: '▲', l: 'MOVE' },
  { to: '/friends', ico: '⁂', l: 'FRIENDS' },
  { to: '/me', ico: '◉', l: 'ME' },
];

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'FRIENDS FEED'],
  [/^\/log/, 'FOOD LOG'],
  [/^\/move\/record/, 'RECORD'],
  [/^\/move/, 'ACTIVITIES'],
  [/^\/friends/, 'FRIENDS'],
  [/^\/me/, 'MY PROFILE'],
  [/^\/u\//, 'PROFILE'],
  [/^\/settings/, 'SETTINGS'],
  [/^\/emojis/, 'EMOJIS'],
  [/^\/invite/, 'INVITE'],
];

export function Layout({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const loc = useLocation();
  const title = TITLES.find(([re]) => re.test(loc.pathname))?.[1] ?? '';
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">GIST<b>//</b></Link>
        <div className="crumb"><span className="muted">~/</span><b className="trunc">{title}</b></div>
        <div className="tb-action">
          <Link to="/settings" className="btn ghost" aria-label="Settings" style={{ height: '100%' }}>⚙</Link>
        </div>
        <div className="tb-action">
          <Link to="/me" aria-label="My profile" style={{ display: 'flex', alignItems: 'center', padding: '0 8px' }}><Avatar p={profile} size={26} /></Link>
        </div>
      </header>
      <main>{children}</main>
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="ico" aria-hidden>{t.ico}</span>
              <span>{t.l}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
