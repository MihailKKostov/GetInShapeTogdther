import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Skeleton, ToastProvider } from './components/ui';
import { SessionProvider, useSession } from './hooks/useSession';
import Login, { LOGO } from './pages/Login';
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

/** Boot screen: shows each step as it resolves instead of a blank page. */
function Boot({ steps }: { steps: [string, boolean][] }) {
  const [dots, setDots] = useState(0);
  useEffect(() => { const t = setInterval(() => setDots((d) => (d + 1) % 4), 250); return () => clearInterval(t); }, []);
  return (
    <div className="login">
      <div className="box col gap2">
        <pre className="ascii">{LOGO}</pre>
        <div className="small" style={{ lineHeight: 1.9 }}>
          {steps.map(([l, done]) => (
            <div key={l}>{done ? <span className="ok">[ OK ]</span> : <span className="accent">[ {'.'.repeat(dots).padEnd(3, ' ')}]</span>} {l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Gate() {
  const { user, authLoading, settings, settingsLoading, profile } = useSession();
  if (authLoading) return <Boot steps={[['AUTH', false]]} />;
  if (!user) return <Login />;
  if (settingsLoading || !profile) return <Boot steps={[['AUTH', true], ['PROFILE', !!profile], ['SETTINGS', !settingsLoading]]} />;
  if (!settings?.setupComplete) return <Layout><Setup /></Layout>;
  return (
    <Layout>
      <Suspense fallback={<div className="page"><Skeleton h={160} label="LOADING MODULE" /></div>}>
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
