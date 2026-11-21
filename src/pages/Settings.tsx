import { useEffect, useRef, useState } from 'react';
import { signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { displayName, saveSettings, setSharing, updateProfile, uploadAvatar } from '../data/api';
import { DEFAULT_SHARING, type PrivateSettings, type Sharing } from '../data/types';
import { GoalsForm } from '../components/GoalsForm';
import { useLatestWeightKg } from '../components/ActivityForm';
import {
  ActionButton, Avatar, ErrorLine, Panel, Seg, Toggle, UploadProgress, useToast,
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
  }, { minPending: 200, doneFor: 10 });

  return (
    <Panel title="PROFILE" idx="01">
      <div className="col gap2">
        <div className="row gap2 top">
          <Avatar p={profile} size={84} />
          <div className="col grow">
            <span className="flabel">Avatar</span>
            <div className="row wrap" style={{ gap: 4 }}>
              <ActionButton size="sm" state={upload.state} pendingLabel="UPLOADING" onClick={() => fileRef.current?.click()}>UPLOAD PHOTO</ActionButton>
              {user?.photoURL && profile.photoURL !== user.photoURL && (
                <button className="btn sm" onClick={() => updateProfile(uid, { photoURL: user.photoURL, avatarMode: 'photo' })}>USE GOOGLE PHOTO</button>
              )}
              {profile.avatarMode === 'photo'
                ? <button className="btn sm" onClick={() => setMode.run('generated')}>USE GENERATED</button>
                : <>
                  <button className="btn sm" onClick={() => setMode.run('generated', true)}>↻ REROLL</button>
                  {profile.photoURL && <button className="btn sm" onClick={() => setMode.run('photo')}>USE PHOTO</button>}
                </>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.run(f); e.target.value = ''; }} />
            {upload.state === 'pending' && <UploadProgress pct={pct} />}
            <ErrorLine>{upload.error}</ErrorLine>
          </div>
        </div>
        <div className="fgrid">
          <label className="f"><span>Nickname · shown instead of "{profile.displayName}"</span>
            <input value={nick} maxLength={30} placeholder={profile.displayName} onChange={(e) => setNick(e.target.value)} />
          </label>
          <label className="f"><span>Status · {status.length}/80</span>
            <input value={status} maxLength={80} placeholder="e.g. 10k in March" onChange={(e) => setStatus(e.target.value)} />
          </label>
        </div>
        <div className="row between">
          <span className="small muted">Shown as: <b>{displayName({ nickname: nick, displayName: profile.displayName })}</b></span>
          <ActionButton variant="primary" state={save.state} onClick={() => save.run()} doneLabel="SAVED">SAVE</ActionButton>
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
      title="GOALS & TARGETS"
      idx="02"
      right={<span className="vis priv">○ PRIVATE</span>}
      footer={<>
        <span className="small muted grow">{dirty ? '● unsaved changes' : 'saved'}</span>
        {dirty && <button className="btn sm ghost" onClick={() => setS(settings)}>RESET</button>}
        <ActionButton variant="primary" state={save.state} disabled={!dirty && save.state === 'idle'} onClick={() => save.run()} doneLabel="SAVED">SAVE GOALS</ActionButton>
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
      toast(`${PRIVACY_ROWS.find((r) => r.k === k)!.l}: ${!sharing[k] ? 'friends can see' : 'private'}`);
    } catch {
      toast('Could not update privacy', 'bad');
    } finally { setBusy(null); }
  };
  return (
    <Panel title="PRIVACY · WHAT FRIENDS SEE" idx="03" tight>
      <table className="kv">
        <tbody>
          <tr><td><b>Name, avatar, status</b><div className="small muted">always visible to friends</div></td><td className="n"><span className="vis pub">◉ FRIENDS</span></td></tr>
          <tr><td><b>Streak, days on target, workout totals</b><div className="small muted">the accountability part — always visible to friends</div></td><td className="n"><span className="vis pub">◉ FRIENDS</span></td></tr>
          {PRIVACY_ROWS.map((r) => (
            <tr key={r.k}>
              <td><b>{r.l}</b>{r.d && <div className="small muted">{r.d}</div>}</td>
              <td className="n"><Toggle on={sharing[r.k]} onChange={() => toggle(r.k)} label={busy === r.k ? '…' : sharing[r.k] ? 'SHARED' : 'PRIVATE'} disabled={busy !== null} /></td>
            </tr>
          ))}
          <tr><td><b>BMI, birth year, sex, email</b><div className="small muted">never shared</div></td><td className="n"><span className="vis priv">○ PRIVATE</span></td></tr>
        </tbody>
      </table>
    </Panel>
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
    <Panel title="APPEARANCE" idx="04">
      <Seg<Theme> value={t} onChange={(v) => { setT(v); applyTheme(v); try { localStorage.setItem('gist.theme', v); } catch { /* ignore */ } }}
        options={[{ v: 'auto', l: 'AUTO' }, { v: 'light', l: 'LIGHT' }, { v: 'dark', l: 'DARK' }]} />
    </Panel>
  );
}

function AccountSection() {
  const { user } = useMe();
  const toast = useToast();
  const isPassword = user?.providerData.some((p) => p.providerId === 'password');
  const reset = useAction(async () => { await sendPasswordResetEmail(auth, user!.email!); toast('Password reset email sent'); });
  return (
    <Panel title="ACCOUNT" idx="05">
      <div className="col">
        <div className="small"><span className="muted">SIGNED IN AS</span> {user?.email} <span className="muted">via {user?.providerData.map((p) => p.providerId.replace('.com', '')).join(', ')}</span></div>
        <div className="row wrap">
          {isPassword && <ActionButton size="sm" state={reset.state} onClick={() => reset.run()} doneLabel="SENT">RESET PASSWORD</ActionButton>}
          <button className="btn sm danger" onClick={() => signOut(auth)}>SIGN OUT</button>
        </div>
      </div>
    </Panel>
  );
}
