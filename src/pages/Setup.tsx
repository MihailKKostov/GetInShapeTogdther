import { useState } from 'react';
import { displayName, logWeight, saveSettings, updateProfile } from '../data/api';
import type { PrivateSettings } from '../data/types';
import { DEFAULT_SETTINGS, GoalsForm } from '../components/GoalsForm';
import { ActionButton, Avatar, ErrorLine, NumInput, Panel } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useSession } from '../hooks/useSession';
import { dateKey } from '../lib/dates';
import { kgTo, toKg, weightUnit } from '../lib/units';
import { suggestedCalories } from '../lib/nutrition';

export default function Setup() {
  const { user, profile } = useSession();
  const uid = user!.uid;
  const [nick, setNick] = useState(profile?.nickname ?? '');
  const [s, setS] = useState<PrivateSettings>({ ...DEFAULT_SETTINGS, email: user?.email ?? '' });
  const [current, setCurrent] = useState<number | ''>('');
  const currentKg = current === '' ? s.startWeightKg : toKg(s.units, current);

  const save = useAction(async () => {
    if (current === '') throw new Error('Enter your current weight');
    const final: PrivateSettings = { ...s, startWeightKg: s.startWeightKg || currentKg, setupComplete: true };
    if (final.calorieGoalAuto) final.calorieGoal = suggestedCalories(final, currentKg);
    if (final.macroPct.protein + final.macroPct.carbs + final.macroPct.fat !== 100) throw new Error('Macro split must total 100%');
    // Save everything else first: the settings doc flips setupComplete, which leaves this screen.
    await updateProfile(uid, { nickname: nick.trim().slice(0, 30) });
    await logWeight(uid, dateKey(), currentKg);
    await saveSettings(uid, final);
  });

  return (
    <div className="page">
      <div>
        <h1>Welcome! Let's set your goals</h1>
        <p className="muted">This takes about 2 minutes. Everything here is private — you choose later what friends can see.</p>
      </div>
      <Panel title="About you">
        <div className="row gap2">
          <Avatar p={profile} size={56} />
          <label className="f grow"><span>Nickname (optional)</span>
            <input value={nick} maxLength={30} placeholder={displayName(profile ? { ...profile, nickname: '' } : null)} onChange={(e) => setNick(e.target.value)} />
          </label>
        </div>
      </Panel>
      <Panel title="Body & goals">
        <div className="col gap2">
          <label className="f"><span>Current weight</span>
            <NumInput value={current} onChange={(v) => { setCurrent(v); if (v !== '') setS((x) => ({ ...x, startWeightKg: toKg(x.units, v) })); }} unit={weightUnit(s.units)} placeholder={String(Math.round(kgTo(s.units, 80)))} />
          </label>
          <GoalsForm s={s} onChange={setS} weightKg={currentKg} />
        </div>
      </Panel>
      <ErrorLine>{save.error}</ErrorLine>
      <ActionButton variant="primary" size="lg" block state={save.state} pendingLabel="Setting up…" doneLabel="All set" onClick={() => save.run()}>
        Start tracking
      </ActionButton>
    </div>
  );
}
