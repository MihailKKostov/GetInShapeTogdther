import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Skeleton, Spinner, ToastProvider } from './components/ui';
import { SessionProvider, useSession } from './hooks/useSession';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Feed from './pages/Feed';
import Diary from './pages/Diary';

const Activities = lazy(() => import('./pages/Activities'));
const Record = lazy(() => import('./pages/Record'));
const Profile = lazy(() => import('./pages/Profile'));
const Friends = lazy(() => import('./pages/Friends'));
const Invite = lazy(() => import('./pages/Invite'));
const Settings = lazy(() => import('./pages/Settings'));
const Emojis = lazy(() => import('./pages/Emojis'));

/** Boot screen: a logo and a spinner while auth and profile load. */
function Boot({ label }: { label: string }) {
  return (
    <div className="login">
      <div className="col" style={{ alignItems: 'center', gap: 16 }}>
        <span className="logo"><img src="/favicon.svg" alt="" />WeFit</span>
        <span className="row muted small"><Spinner /> {label}</span>
      </div>
    </div>
  );
}

const preload = [
  () => import('./pages/Activities'), () => import('./pages/Profile'), () => import('./pages/Friends'),
  () => import('./pages/Settings'), () => import('./pages/Record'), () => import('./pages/Emojis'),
  () => import('./pages/Invite'), () => import('./components/ActivityForm'),
];
function usePreloadRoutes(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => preload.forEach((load) => load().catch(() => undefined));
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run); else setTimeout(run, 1200);
  }, [enabled]);
}

function Gate() {
  const { user, authLoading, settings, settingsLoading, profile } = useSession();
  usePreloadRoutes(!!settings?.setupComplete);
  if (authLoading) return <Boot label="Signing in…" />;
  if (!user) return <Login />;
  if (settingsLoading || !profile) return <Boot label="Loading your profile…" />;
  if (!settings?.setupComplete) return <Layout><Setup /></Layout>;
  return (
    <Layout>
      <Suspense fallback={<div className="page"><Skeleton h={160} /></div>}>
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/log" element={<Diary />} />
          <Route path="/move" element={<Activities />} />
          <Route path="/move/record" element={<Record />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/me" element={<Profile />} />
          <Route path="/u/:uid" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/emojis" element={<Emojis />} />
          <Route path="/invite/:code" element={<Invite />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
