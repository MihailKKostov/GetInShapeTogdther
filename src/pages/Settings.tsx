import { useEffect, useRef, useState } from 'react';
import { useAiSettings } from '../components/PhotoTab';
import { AI_MODELS, aiSettings, testKey } from '../lib/foodPhoto';
import { signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { displayName, saveSettings, setSharing, updateProfile, uploadAvatar } from '../data/api';
import { DEFAULT_SHARING, type PrivateSettings, type Sharing } from '../data/types';
import { EmojiField } from '../components/EmojiText';
import { GoalsForm } from '../components/GoalsForm';
import { useLatestWeightKg } from '../components/ActivityForm';
import {
  ActionButton, Avatar, ErrorLine, Panel, Seg, Spinner, Toggle, UploadProgress, useToast,
} from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useMe } from '../hooks/useSession';
import { randomSeed } from '../lib/avatar';
import { squareImage } from '../lib/images';

export default function Settings() {
  return (
    <div className="page">
      <ProfileSection />
      <GoalsSection />
      <PrivacySection />
      <AiSection />
      <AppearanceSection />
      <AccountSection />
    </div>
  );
}

function ProfileSection() {
  const { uid, user, profile } = useMe();
  const toast = useToast();
  const [nick, setNick] = useState(profile.nickname);
  const [status, setStatus] = useState(profile.status);
  const [pct, setPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useAction(async () => {
    await updateProfile(uid, { nickname: nick.trim().slice(0, 30), status: status.trim().slice(0, 80) });
    toast('Profile saved');
  });
  const upload = useAction(async (f: File) => {
    setPct(0);
    const img = await squareImage(f, 512, 'image/jpeg', 0.88);
    await uploadAvatar(uid, img, setPct);
    toast('Avatar updated');
  });
  const setMode = useAction(async (mode: 'photo' | 'generated', reroll = false) => {
    const data: Record<string, unknown> = { avatarMode: mode };
    if (reroll) data.avatarSeed = randomSeed();
    if (mode === 'photo' && !profile.photoURL) data.photoURL = user?.photoURL ?? null;
    await updateProfile(uid, data);
  }, { doneFor: 10 });

  return (
    <Panel title="Profile">
      <div className="col gap2">
        <div className="row gap2 top">
          <Avatar p={profile} size={84} />
          <div className="col grow">
            <span className="flabel">Avatar</span>
            <div className="row wrap" style={{ gap: 4 }}>
              <ActionButton size="sm" state={upload.state} pendingLabel="Uploading…" onClick={() => fileRef.current?.click()}>Upload photo</ActionButton>
              {user?.photoURL && profile.photoURL !== user.photoURL && (
                <button className="btn sm" onClick={() => updateProfile(uid, { photoURL: user.photoURL, avatarMode: 'photo' })}>Use Google photo</button>
              )}
              {profile.avatarMode === 'photo'
                ? <button className="btn sm" onClick={() => setMode.run('generated')}>Use initials</button>
                : <>
                  <button className="btn sm" onClick={() => setMode.run('generated', true)}>Change color</button>
                  {profile.photoURL && <button className="btn sm" onClick={() => setMode.run('photo')}>Use photo</button>}
                </>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.run(f); e.target.value = ''; }} />
            {upload.state === 'pending' && <UploadProgress pct={pct} />}
            <ErrorLine>{upload.error}</ErrorLine>
          </div>
        </div>
        <div className="fgrid">
          <label className="f"><span>Nickname (optional)</span>
            <input value={nick} maxLength={30} placeholder={profile.displayName} onChange={(e) => setNick(e.target.value)} />
          </label>
          <label className="f"><span>Status ({status.length}/80)</span>
            <EmojiField value={status} maxLength={80} placeholder="e.g. Training for a 10k :muscle:" onChange={setStatus} />
          </label>
        </div>
        <div className="row between">
          <span className="small muted">Friends see you as <b>{displayName({ nickname: nick, displayName: profile.displayName })}</b></span>
          <ActionButton variant="primary" state={save.state} onClick={() => save.run()} doneLabel="Saved">Save</ActionButton>
        </div>
      </div>
    </Panel>
  );
}

function GoalsSection() {
  const { uid, settings } = useMe();
  const toast = useToast();
  const weightKg = useLatestWeightKg();
  const [s, setS] = useState<PrivateSettings>(settings);
  useEffect(() => setS(settings), [settings]);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const save = useAction(async () => {
    if (s.macroPct.protein + s.macroPct.carbs + s.macroPct.fat !== 100) throw new Error('Macro split must total 100%');
    await saveSettings(uid, s);
    toast('Goals saved');
  });
  return (
    <Panel
      title="Goals & targets"
      right={<span className="vis">🔒 Private</span>}
      footer={<>
        <span className="small muted grow">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        {dirty && <button className="btn sm ghost" onClick={() => setS(settings)}>Discard</button>}
        <ActionButton variant="primary" state={save.state} disabled={!dirty && save.state === 'idle'} onClick={() => save.run()} doneLabel="Saved">Save goals</ActionButton>
      </>}
    >
      <GoalsForm s={s} onChange={setS} weightKg={weightKg} />
      <ErrorLine>{save.error}</ErrorLine>
    </Panel>
  );
}

const PRIVACY_ROWS: { k: keyof Sharing; l: string; d: string }[] = [
  { k: 'currentWeight', l: 'Current weight', d: 'Latest weigh-in on your profile' },
  { k: 'targetWeight', l: 'Target weight', d: 'Your goal weight' },
  { k: 'startWeight', l: 'Start weight', d: 'Where you started' },
  { k: 'weightChange', l: 'Weight change', d: 'Only the difference, e.g. −4.2 kg' },
  { k: 'weightHistory', l: 'Weight history chart', d: 'All weigh-ins over time' },
  { k: 'height', l: 'Height', d: '' },
  { k: 'calorieGoal', l: 'Calorie goal', d: 'Daily kcal target' },
  { k: 'diary', l: 'Food log', d: 'Daily calories, on-target calendar and what you ate' },
  { k: 'activities', l: 'Activity history', d: 'Workouts you didn\'t mark private' },
];

function PrivacySection() {
  const { uid, profile } = useMe();
  const toast = useToast();
  const sharing: Sharing = { ...DEFAULT_SHARING, ...(profile.sharing ?? {}) };
  const [busy, setBusy] = useState<keyof Sharing | null>(null);
  const toggle = async (k: keyof Sharing) => {
    setBusy(k);
    try {
      await setSharing(uid, { ...sharing, [k]: !sharing[k] });
      toast(`${PRIVACY_ROWS.find((r) => r.k === k)!.l}: ${!sharing[k] ? 'visible to friends' : 'private'}`);
    } catch {
      toast('Could not update privacy', 'bad');
    } finally { setBusy(null); }
  };
  return (
    <Panel title="Privacy" tight>
      <p className="small muted" style={{ margin: '0 16px 4px' }}>Choose what your friends can see.</p>
      <div className="list">
        <div className="li"><div className="main"><div className="name">Name, photo, status</div><div className="sub">Always visible to friends</div></div><span className="vis pub">👥 Friends</span></div>
        <div className="li"><div className="main"><div className="name">Streaks & workout totals</div><div className="sub">Always visible to friends</div></div><span className="vis pub">👥 Friends</span></div>
        {PRIVACY_ROWS.map((r) => (
          <div className="li" key={r.k}>
            <div className="main"><div className="name">{r.l}</div>{r.d && <div className="sub">{r.d}</div>}</div>
            {busy === r.k && <Spinner />}
            <Toggle on={sharing[r.k]} onChange={() => toggle(r.k)} disabled={busy !== null} />
          </div>
        ))}
        <div className="li"><div className="main"><div className="name">BMI, birth year, sex, email</div><div className="sub">Never shared</div></div><span className="vis">🔒 Private</span></div>
      </div>
    </Panel>
  );
}

function AiSection() {
  const toast = useToast();
  const { key, model } = useAiSettings();
  const [draft, setDraft] = useState('');
  const [mdl, setMdl] = useState(model);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (location.hash === '#ai') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const save = useAction(async () => {
    const k = draft.trim() || key;
    if (!k) throw new Error('Paste your API key first');
    if (!/^sk-/.test(k)) throw new Error('OpenAI keys start with "sk-"');
    const problem = await testKey(k, mdl);
    if (problem) throw new Error(problem);
    aiSettings.setKey(k);
    aiSettings.setModel(mdl);
    setDraft('');
    toast('OpenAI key verified and saved on this device');
  });
  return (
    <section ref={ref} id="ai" style={{ scrollMarginTop: 64 }}>
      <Panel title="AI food estimates" right={key ? <span className="pill ok">✓ Set up</span> : <span className="pill">Off</span>}>
        <div className="col gap2">
          <p className="small muted" style={{ margin: 0 }}>
            Estimate calories from a photo of your meal or a description of what you ate (Diary → Add food → AI estimate). It uses your own OpenAI API key:
            create one at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer noopener">platform.openai.com/api-keys</a>.
            Each photo costs a small amount, billed to your OpenAI account.
          </p>
          <label className="f">
            <span>OpenAI API key</span>
            <input
              type="password" autoComplete="off" spellCheck={false}
              placeholder={key ? `Saved (…${key.slice(-4)}). Paste to replace` : 'sk-…'}
              value={draft} onChange={(e) => { setDraft(e.target.value); if (save.state === 'error') save.reset(); }}
            />
          </label>
          <label className="f">
            <span>Model</span>
            <select value={mdl} onChange={(e) => { setMdl(e.target.value); if (save.state === 'error') save.reset(); }}>
              {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              {!AI_MODELS.some((m) => m.id === mdl) && <option value={mdl}>{mdl}</option>}
            </select>
          </label>
          <ErrorLine>{save.error}</ErrorLine>
          <div className="row wrap">
            <ActionButton variant="primary" state={save.state} pendingLabel="Checking key…" doneLabel="Saved" onClick={() => save.run()}
              disabled={!draft.trim() && (!key || mdl === model)}>
              {key && !draft.trim() ? 'Save model' : 'Verify & save'}
            </ActionButton>
            {key && <button className="btn danger" onClick={() => { aiSettings.setKey(''); toast('OpenAI key removed from this device'); }}>Remove key</button>}
          </div>
          <p className="small faint" style={{ margin: 0 }}>
            🔒 Your key is stored only in this browser on this device. It's sent directly to OpenAI and never to WeFit's servers or your friends.
            Add it again on each device you use.
          </p>
        </div>
      </Panel>
    </section>
  );
}

type Theme = 'auto' | 'light' | 'dark';
export function applyTheme(t: Theme) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function AppearanceSection() {
  const [t, setT] = useState<Theme>(() => { try { return (localStorage.getItem('gist.theme') as Theme) || 'auto'; } catch { return 'auto'; } });
  return (
    <Panel title="Appearance">
      <Seg<Theme> value={t} onChange={(v) => { setT(v); applyTheme(v); try { localStorage.setItem('gist.theme', v); } catch { /* ignore */ } }}
        options={[{ v: 'auto', l: 'System' }, { v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }]} />
    </Panel>
  );
}

function AccountSection() {
  const { user } = useMe();
  const toast = useToast();
  const isPassword = user?.providerData.some((p) => p.providerId === 'password');
  const reset = useAction(async () => { await sendPasswordResetEmail(auth, user!.email!); toast('Password reset email sent'); });
  return (
    <Panel title="Account">
      <div className="col">
        <div className="small"><span className="muted">Signed in as</span> {user?.email}</div>
        <div className="row wrap">
          {isPassword && <ActionButton size="sm" state={reset.state} onClick={() => reset.run()} doneLabel="Email sent">Reset password</ActionButton>}
          <button className="btn sm danger" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </div>
    </Panel>
  );
}
