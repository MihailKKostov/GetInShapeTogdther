import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, updateProfile,
} from 'firebase/auth';
import { auth, isConfigured } from '../firebase';
import { ActionButton, ErrorLine, Seg } from '../components/ui';
import { useAction } from '../hooks/useAction';

function friendly(msg: string) {
  if (msg.includes('invalid-credential') || msg.includes('wrong-password')) return 'Wrong email or password';
  if (msg.includes('user-not-found')) return 'No account with that email';
  if (msg.includes('email-already-in-use')) return 'An account with this email already exists — sign in instead';
  if (msg.includes('weak-password')) return 'Password must be at least 6 characters';
  if (msg.includes('invalid-email')) return 'That email looks wrong';
  if (msg.includes('popup-closed')) return 'Sign-in window was closed';
  return msg;
}

export default function Login() {
  const loc = useLocation();
  const invited = loc.pathname.startsWith('/invite/');
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>(invited ? 'up' : 'in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [sent, setSent] = useState(false);

  const google = useAction(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
      } else throw e;
    }
  });

  const submit = useAction(async () => {
    try {
      if (mode === 'in') await signInWithEmailAndPassword(auth, email.trim(), pw);
      else if (mode === 'up') {
        if (!name.trim()) throw new Error('Enter your name');
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
        await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setSent(true);
      }
    } catch (e) {
      throw new Error(friendly(e instanceof Error ? e.message : String(e)));
    }
  });

  return (
    <div className="login">
      <div className="box col gap2">
        <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 6, marginBottom: 8 }}>
          <span className="logo"><img src="/favicon.svg" alt="" />GIST</span>
          <p className="muted" style={{ margin: 0 }}>Get in shape together — track food, workouts and progress with friends.</p>
        </div>
        {invited && <div className="pill accent" style={{ justifyContent: 'center', padding: '8px 12px' }}>You've been invited! Sign in or create an account to accept.</div>}
        {!isConfigured && <div className="err">Firebase is not configured. Set the VITE_FIREBASE_* variables (see README).</div>}
        <section className="panel">
          <div className="panel-b col gap2" style={{ paddingTop: 18 }}>
            <ActionButton block size="lg" state={google.state} pendingLabel="Opening Google…" doneLabel="Signed in" onClick={() => google.run()}>
              <GoogleMark /> Continue with Google
            </ActionButton>
            <ErrorLine>{google.error && friendly(google.error)}</ErrorLine>
            <div className="row small muted"><span className="grow" style={{ borderTop: '1px solid var(--line)' }} />or<span className="grow" style={{ borderTop: '1px solid var(--line)' }} /></div>
            <Seg value={mode} onChange={(m) => { setMode(m); setSent(false); }} block options={[{ v: 'in', l: 'Sign in' }, { v: 'up', l: 'Sign up' }, { v: 'reset', l: 'Reset' }]} />
            <form className="col" onSubmit={(e) => { e.preventDefault(); submit.run(); }}>
              {mode === 'up' && <label className="f"><span>Name</span><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
              <label className="f"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              {mode !== 'reset' && (
                <label className="f"><span>Password</span><input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} /></label>
              )}
              <ErrorLine>{submit.error}</ErrorLine>
              {sent && <div className="small ok">✓ Reset link sent — check your inbox.</div>}
              <ActionButton type="submit" variant="primary" block state={submit.state} pendingLabel={mode === 'reset' ? 'Sending…' : 'Signing in…'} doneLabel={mode === 'reset' ? 'Sent' : 'Welcome'}>
                {mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
              </ActionButton>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
