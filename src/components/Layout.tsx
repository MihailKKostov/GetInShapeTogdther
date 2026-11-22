import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { Avatar, Icon } from './ui';

const TABS = [
  { to: '/', icon: 'feed', l: 'Feed', end: true },
  { to: '/log', icon: 'diary', l: 'Diary' },
  { to: '/move', icon: 'move', l: 'Exercise' },
  { to: '/friends', icon: 'friends', l: 'Friends' },
  { to: '/me', icon: 'me', l: 'Profile' },
];

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Feed'],
  [/^\/log/, 'Diary'],
  [/^\/move\/record/, 'Record'],
  [/^\/move/, 'Exercise'],
  [/^\/friends/, 'Friends'],
  [/^\/me/, 'Profile'],
  [/^\/u\//, 'Profile'],
  [/^\/settings/, 'Settings'],
  [/^\/emojis/, 'Custom emojis'],
  [/^\/invite/, 'Invite'],
];

export function Layout({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const loc = useLocation();
  const title = TITLES.find(([re]) => re.test(loc.pathname))?.[1] ?? '';
  return (
    <div className="shell">
      <header className="topbar">
        <span className="title">{title}</span>
        <Link to="/settings" className="icon-btn" aria-label="Settings"><Icon name="settings" size={21} /></Link>
        <Link to="/me" aria-label="My profile" style={{ display: 'flex' }}><Avatar p={profile} size={32} /></Link>
      </header>
      <main>{children}</main>
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name={t.icon} size={23} />
              <span>{t.l}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
