import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, updateProfile,
} from 'firebase/auth';
import { auth, isConfigured } from '../firebase';
import { ActionButton, ErrorLine, Seg } from '../components/ui';
import { useAction } from '../hooks/useAction';

export const LOGO = String.raw`
 ██████  ██ ███████ ████████
██       ██ ██         ██
██   ███ ██ ███████    ██
██    ██ ██      ██    ██
 ██████  ██ ███████    ██   `;

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
        <pre className="ascii" aria-label="GIST">{LOGO}</pre>
        <div>
          <h1>GET IN SHAPE TOGETHER</h1>
          <p className="small muted">Food log · workouts · progress — with friends who keep you honest.</p>
        </div>
        {invited && <div className="panel" style={{ padding: 10, borderColor: 'var(--accent)' }}><b className="accent">● YOU'VE BEEN INVITED.</b> <span className="small">Sign in or create an account to accept.</span></div>}
        {!isConfigured && (
          <div className="err">Firebase is not configured. Set the VITE_FIREBASE_* variables (see README).</div>
        )}
        <section className="panel">
          <div className="panel-b col gap2">
            <ActionButton block size="lg" variant="primary" state={google.state} pendingLabel="OPENING GOOGLE" doneLabel="SIGNED IN" onClick={() => google.run()}>
              CONTINUE WITH GOOGLE
            </ActionButton>
            <ErrorLine>{google.error && friendly(google.error)}</ErrorLine>
            <div className="row small muted"><span className="grow" style={{ borderTop: '1px dashed var(--faint)' }} /> OR EMAIL <span className="grow" style={{ borderTop: '1px dashed var(--faint)' }} /></div>
            <Seg value={mode} onChange={(m) => { setMode(m); setSent(false); }} block options={[{ v: 'in', l: 'SIGN IN' }, { v: 'up', l: 'CREATE' }, { v: 'reset', l: 'RESET' }]} />
            <form className="col" onSubmit={(e) => { e.preventDefault(); submit.run(); }}>
              {mode === 'up' && <label className="f"><span>Name</span><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
              <label className="f"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              {mode !== 'reset' && (
                <label className="f"><span>Password</span><input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} /></label>
              )}
              <ErrorLine>{submit.error}</ErrorLine>
              {sent && <div className="small ok">✓ Reset link sent — check your inbox.</div>}
              <ActionButton type="submit" block state={submit.state} pendingLabel={mode === 'reset' ? 'SENDING' : 'AUTHENTICATING'} doneLabel={mode === 'reset' ? 'SENT' : 'OK'}>
                {mode === 'in' ? 'SIGN IN →' : mode === 'up' ? 'CREATE ACCOUNT →' : 'SEND RESET LINK'}
              </ActionButton>
            </form>
          </div>
        </section>
        <p className="small faint">Not a social network. No chats, no comments, no ads. Just progress and emoji.</p>
      </div>
    </div>
  );
}
