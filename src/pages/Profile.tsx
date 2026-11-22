import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { limit, orderBy, query, where } from 'firebase/firestore';
import {
  activitiesCol, diaryCol, displayName, setSharing, updateProfile, userRef, weightsCol,
} from '../data/api';
import {
  DEFAULT_SHARING, EMPTY_STATS, type Activity, type DiaryDay, type Post, type Sharing,
  type UserProfile, type WeightEntry,
} from '../data/types';
import { BarChart, LineChart } from '../components/Charts';
import { EmojiField, EmojiText } from '../components/EmojiText';
import {
  ActionButton, Avatar, Empty, Icon, Lightbox, Panel, Seg, Skeleton, VisBadge, useToast,
} from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useDoc, useQuery } from '../hooks/useFirestore';
import { useMe } from '../hooks/useSession';
import { usePosts } from '../hooks/useSocial';
import { addDays, dateKey, fmtDuration, fmtShort, parseKey, relTime } from '../lib/dates';
import { fmtDist, fmtHeight, fmtNum, fmtWeight, kgTo, weightUnit } from '../lib/units';
import { ActivityDetail, ActivityList, weeklyMinutes } from './Activities';

export default function Profile() {
  const params = useParams();
  const { uid: me, friendIds } = useMe();
  const uid = params.uid ?? me;
  const self = uid === me;
  const isFriend = friendIds.includes(uid);
  const prof = useDoc<UserProfile>(self || isFriend ? userRef(uid) : null, `prof:${uid}:${isFriend}`);

  if (!self && !isFriend) {
    return (
      <div className="page">
        <div className="panel"><Empty icon="🔒" title="Not connected">You can only view your friends' profiles. <Link to="/friends">Go to friends</Link></Empty></div>
      </div>
    );
  }
  if (prof.loading || !prof.data) {
    return <div className="page"><Skeleton h={120} /><Skeleton h={200} /></div>;
  }
  return <ProfileView p={prof.data} self={self} />;
}

type ShareKey = keyof Sharing;

function useShareToggle(p: UserProfile, self: boolean) {
  const { uid } = useMe();
  const toast = useToast();
  const sharing: Sharing = { ...DEFAULT_SHARING, ...(p.sharing ?? {}) };
  const [busy, setBusy] = useState<ShareKey | null>(null);
  const action = useAction(async (k: ShareKey) => {
    setBusy(k);
    const next = { ...sharing, [k]: !sharing[k] };
    await setSharing(uid, next);
    toast(`${LABELS[k]} is now ${next[k] ? 'visible to friends' : 'private'}`);
  }, { minPending: 300, doneFor: 10 });
  const badge = (k: ShareKey) => (
    <VisBadge
      pub={sharing[k]}
      state={busy === k ? action.state : undefined}
      onToggle={self ? () => action.run(k).finally(() => setBusy(null)) : undefined}
    />
  );
  return { sharing, badge };
}

const LABELS: Record<ShareKey, string> = {
  currentWeight: 'Current weight', targetWeight: 'Target weight', startWeight: 'Start weight',
  weightChange: 'Weight change', weightHistory: 'Weight history', height: 'Height',
  calorieGoal: 'Calorie goal', diary: 'Food log', activities: 'Activities',
};

function ProfileView({ p, self }: { p: UserProfile; self: boolean }) {
  const { units, settings } = useMe();
  const { sharing, badge } = useShareToggle(p, self);
  const stats = { ...EMPTY_STATS, ...(p.stats ?? {}) };
  const canWeights = self || sharing.weightHistory;
  const canDiary = self || sharing.diary;
  const canActs = self || sharing.activities;

  const weights = useQuery<WeightEntry>(
    canWeights ? query(weightsCol(p.uid), orderBy('date', 'desc'), limit(400)) : null,
    `pw:${p.uid}:${canWeights}`,
  );
  const latest = weights.data[0]?.kg;

  // body values: own private settings for self; shared values for friends
  const body = self ? {
    current: latest, target: settings.targetWeightKg, start: settings.startWeightKg,
    change: latest != null ? latest - settings.startWeightKg : undefined, height: settings.heightCm, kcal: settings.calorieGoal,
  } : {
    current: p.shared?.currentWeightKg, target: p.shared?.targetWeightKg, start: p.shared?.startWeightKg,
    change: p.shared?.weightChangeKg, height: p.shared?.heightCm, kcal: p.shared?.calorieGoal,
  };
  const toGo = body.current != null && body.target != null ? body.target - body.current : undefined;
  const bmi = self && latest ? latest / (settings.heightCm / 100) ** 2 : undefined;

  const cell = (k: ShareKey | null, label: string, value: string, sub?: string) => {
    const hidden = !self && k && !sharing[k];
    return (
      <div className="stat">
        <div className="k"><span>{label}</span>{self && (k ? badge(k) : <span className="vis">🔒 Private</span>)}</div>
        <div className="v">{hidden ? <span className="faint">🔒</span> : value}</div>
        {(sub || hidden) && <div className="s">{hidden ? 'Not shared' : sub}</div>}
      </div>
    );
  };

  return (
    <div className="page">
      <Header p={p} self={self} />

      <Panel title="Highlights">
        <div className="stats c4">
          <div className="stat"><div className="k">🔥 Streak</div><div className="v">{stats.streak}<small> {stats.streak === 1 ? 'day' : 'days'}</small></div><div className="s">Best: {stats.bestStreak}</div></div>
          <div className="stat"><div className="k">✓ Days on target</div><div className="v">{stats.daysOnTarget}</div><div className="s">{stats.lastClosedDay ? `Last: ${fmtShort(parseKey(stats.lastClosedDay))}` : 'None yet'}</div></div>
          <div className="stat"><div className="k">🏃 Workouts</div><div className="v">{stats.workouts}</div><div className="s">{fmtDuration(stats.activeSec)} total</div></div>
          <div className="stat"><div className="k">📍 Distance</div><div className="v">{fmtDist(units, stats.distanceM)}</div><div className="s">All time</div></div>
        </div>
      </Panel>

      <Panel title="Body & goals" right={self ? <span className="muted small">Tap a badge to change</span> : undefined}>
        <div className="stats c3 m2">
          {cell('currentWeight', 'Current', fmtWeight(units, body.current), body.current == null ? 'No weigh-in yet' : undefined)}
          {cell('targetWeight', 'Goal', fmtWeight(units, body.target), toGo != null
            ? `${fmtWeight(units, toGo, true)} to go${self && settings.targetDate ? ` · by ${fmtShort(parseKey(settings.targetDate))}` : ''}`
            : undefined)}
          {cell('startWeight', 'Start', fmtWeight(units, body.start))}
          {cell('weightChange', 'Change', fmtWeight(units, body.change, true), 'Since start')}
          {cell('height', 'Height', fmtHeight(units, body.height))}
          {cell('calorieGoal', 'Calories', body.kcal ? `${fmtNum(body.kcal)}` : '—', 'kcal per day')}
          {self && cell(null, 'BMI', bmi ? fmtNum(bmi, 1) : '—')}
        </div>
      </Panel>

      <Panel title="Weight trend" right={self ? badge('weightHistory') : undefined}>
        {!canWeights ? <PrivateNote what="weight history" /> : weights.loading ? <Skeleton h={180} /> : (
          <WeightChart data={weights.data} target={body.target} />
        )}
      </Panel>

      <Panel title="Nutrition" right={self ? badge('diary') : undefined}>
        {!canDiary ? <PrivateNote what="food log" /> : <CalorieHistory uid={p.uid} />}
      </Panel>

      <Panel title="Exercise" tight right={self ? badge('activities') : undefined}>
        {!canActs ? <PrivateNote what="exercise history" /> : <ActivitySection uid={p.uid} self={self} />}
      </Panel>

      <ProgressPhotos uid={p.uid} />
    </div>
  );
}

function PrivateNote({ what }: { what: string }) {
  return <Empty icon="🔒" title="Private">This friend hasn't shared their {what}.</Empty>;
}

function Header({ p, self }: { p: UserProfile; self: boolean }) {
  const { uid } = useMe();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(p.status);
  const save = useAction(async () => {
    await updateProfile(uid, { status: status.trim().slice(0, 80) });
    setEditing(false);
    toast('Status updated');
  });
  return (
    <section className="panel">
      <div className="row top" style={{ padding: 16, gap: 16 }}>
        <Avatar p={p} size={72} />
        <div className="grow col" style={{ gap: 4 }}>
          <h1 className="trunc">{displayName(p)}</h1>
          {p.nickname && p.nickname !== p.displayName && <div className="small muted">{p.displayName}</div>}
          {editing ? (
            <div className="col" style={{ gap: 6 }}>
              <EmojiField value={status} maxLength={80} autoFocus placeholder="e.g. Training for a 10k" onChange={setStatus} onEnter={() => save.run()} />
              <div className="row">
                <ActionButton size="sm" variant="primary" state={save.state} onClick={() => save.run()}>Save</ActionButton>
                <button className="btn sm ghost" onClick={() => { setEditing(false); setStatus(p.status); }}>Cancel</button>
                <span className="small muted">{status.length}/80</span>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              <span className={p.status ? '' : 'faint'}>{p.status ? <EmojiText text={p.status} /> : self ? 'Set a status' : ''}</span>
              {self && <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setEditing(true)} aria-label="Edit status"><Icon name="edit" size={16} /></button>}
            </div>
          )}
          <div className="small muted">Active {relTime(p.lastActiveAt?.toDate?.())}</div>
        </div>
      </div>
      {self && (
        <div className="panel-f">
          <Link className="btn sm" to="/settings">Edit profile & goals</Link>
          <Link className="btn sm ghost" to="/emojis">Custom emojis</Link>
        </div>
      )}
    </section>
  );
}

type Range = '30' | '90' | '365' | 'all';

function WeightChart({ data, target }: { data: WeightEntry[]; target?: number }) {
  const { units } = useMe();
  const [range, setRange] = useState<Range>('90');
  const pts = useMemo(() => {
    const from = range === 'all' ? '' : addDays(dateKey(), -Number(range));
    return [...data].reverse().filter((w) => w.date >= from).map((w) => ({
      x: parseKey(w.date).getTime(), y: kgTo(units, w.kg), label: fmtShort(parseKey(w.date)),
    }));
  }, [data, range, units]);
  if (!data.length) return <Empty icon="⚖️" title="No weigh-ins yet">Log your weight from the Diary.</Empty>;
  const first = pts[0]?.y, last = pts[pts.length - 1]?.y;
  return (
    <div className="col">
      <div className="row between wrap">
        <Seg<Range> value={range} onChange={setRange} options={[{ v: '30', l: '1M' }, { v: '90', l: '3M' }, { v: '365', l: '1Y' }, { v: 'all', l: 'All' }]} />
        {pts.length > 1 && <span className="small"><b>{last - first > 0 ? '+' : ''}{fmtNum(last - first, 1)} {weightUnit(units)}</b> <span className="muted">this period</span></span>}
      </div>
      {pts.length ? <LineChart points={pts} target={target != null ? kgTo(units, target) : undefined} unit={weightUnit(units)} /> : <div className="small muted">No weigh-ins in this range.</div>}
    </div>
  );
}

function CalorieHistory({ uid }: { uid: string }) {
  const days = useQuery<DiaryDay>(query(diaryCol(uid), orderBy('date', 'desc'), limit(84)), `pd:${uid}`);
  const [view, setView] = useState<'bars' | 'grid'>('grid');
  if (days.loading) return <Skeleton h={160} />;
  const byDate = new Map(days.data.map((d) => [d.date, d]));
  const today = dateKey();
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)).map((k) => {
    const d = byDate.get(k);
    const kcal = d?.totals?.kcal ?? (d?.entries ?? []).reduce((s, e) => s + e.n.kcal, 0);
    return {
      key: k,
      label: fmtShort(parseKey(k)),
      value: kcal,
      target: d?.budget,
      cls: !d?.closed ? 'open' : d.onTarget ? 'ok' : kcal > (d.budget ?? 0) ? 'over' : 'under',
      tip: !d ? 'not logged' : !d.closed ? 'not completed' : d.onTarget ? 'on target' : 'off target',
    };
  });
  const closed = days.data.filter((d) => d.closed);
  const on = closed.filter((d) => d.onTarget).length;
  return (
    <div className="col">
      <div className="row between wrap">
        <Seg value={view} onChange={setView} options={[{ v: 'grid', l: '12 weeks' }, { v: 'bars', l: '30 days' }]} />
        <span className="small"><b>{on}</b> of {closed.length} <span className="muted">days on target</span></span>
      </div>
      {view === 'bars' ? <BarChart data={last30} unit="kcal" /> : <DayGrid byDate={byDate} />}
      <div className="legend">
        <span><i style={{ background: 'var(--ok)' }} />On target</span>
        <span><i style={{ background: 'var(--bad)' }} />Over</span>
        <span><i style={{ background: 'var(--warn)' }} />Under</span>
        <span><i style={{ background: 'var(--line)' }} />Not completed</span>
      </div>
    </div>
  );
}

function DayGrid({ byDate }: { byDate: Map<string, DiaryDay> }) {
  const today = dateKey();
  const dow = (parseKey(today).getDay() + 6) % 7;
  const start = addDays(today, -(7 * 11 + dow));
  const cells = Array.from({ length: 7 * 11 + dow + 1 }, (_, i) => addDays(start, i));
  const [sel, setSel] = useState<string | null>(null);
  const s = sel ? byDate.get(sel) : null;
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="day-grid">
        {cells.map((k) => {
          const d = byDate.get(k);
          const kcal = d?.totals?.kcal ?? 0;
          const color = !d?.closed ? (d?.entries?.length ? 'var(--line)' : undefined) : d.onTarget ? 'var(--ok)' : kcal > (d.budget ?? 0) ? 'var(--bad)' : 'var(--warn)';
          return (
            <button key={k} onClick={() => setSel(k)} title={k} className={k === sel ? 'sel' : ''} style={color ? { background: color } : undefined} />
          );
        })}
      </div>
      <div className="small">{sel ? <>{fmtShort(parseKey(sel))}: {s ? `${fmtNum(s.totals?.kcal ?? 0)} / ${fmtNum(s.budget ?? 0)} kcal · ${s.closed ? (s.onTarget ? 'on target' : 'off target') : 'not completed'}` : 'not logged'}</> : <span className="muted">Tap a day for details</span>}</div>
    </div>
  );
}

function ActivitySection({ uid, self }: { uid: string; self: boolean }) {
  const q = self
    ? query(activitiesCol(uid), orderBy('startedAt', 'desc'), limit(60))
    : query(activitiesCol(uid), where('visibility', '==', 'friends'), orderBy('startedAt', 'desc'), limit(60));
  const acts = useQuery<Activity>(q, `pa:${uid}:${self}`);
  const [open, setOpen] = useState<Activity | null>(null);
  const weekly = useMemo(() => weeklyMinutes(acts.data), [acts.data]);
  if (acts.loading) return <div style={{ padding: 16 }}><Skeleton h={140} /></div>;
  if (!acts.data.length) return <Empty icon="🏃" title="No exercise yet" />;
  return (
    <>
      <div style={{ padding: '4px 16px 8px' }}><BarChart data={weekly} unit="min" h={120} /></div>
      <ActivityList acts={acts.data.slice(0, 10)} onOpen={setOpen} />
      {open && <ActivityDetail a={open} onClose={() => setOpen(null)} editable={self} />}
    </>
  );
}

function ProgressPhotos({ uid }: { uid: string }) {
  const { uid: me, units } = useMe();
  const posts = usePosts([uid], me, 120, true);
  const [sel, setSel] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [mode, setMode] = useState<'grid' | 'compare'>('grid');
  const items = useMemo(() => posts.posts.flatMap((p) => p.photos.map((ph, i) => ({ key: `${p.id}:${i}`, post: p, ph }))), [posts.posts]);
  const pick = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s.slice(-1), k]));
  const chosen = (sel.length === 2 ? sel : items.length >= 2 ? [items[items.length - 1].key, items[0].key] : [])
    .map((k) => items.find((i) => i.key === k)!).filter(Boolean)
    .sort((a, b) => (a.post.createdAt?.toMillis() ?? 0) - (b.post.createdAt?.toMillis() ?? 0));

  return (
    <Panel
      title="Progress photos"
      right={items.length >= 2 ? <Seg value={mode} onChange={setMode} options={[{ v: 'grid', l: 'Timeline' }, { v: 'compare', l: 'Compare' }]} /> : undefined}
      footer={items.length >= 2 ? (
        <span className="small muted">{mode === 'grid' ? `Select two photos to compare (${sel.length}/2)` : sel.length === 2 ? 'Comparing your selection' : 'Comparing first and latest'}</span>
      ) : undefined}
    >
      {posts.loading ? <Skeleton h={160} /> : items.length === 0 ? (
        <Empty icon="📸" title="No progress photos">{uid === me ? 'Post a progress photo from the feed to start your timeline.' : 'Nothing shared yet.'}</Empty>
      ) : mode === 'compare' && chosen.length === 2 ? (
        <div className="compare">
          {chosen.map((c, i) => (
            <figure key={c.key}>
              <img src={c.ph.url} alt="" onClick={() => setZoom(c.ph.url)} style={{ cursor: 'zoom-in' }} />
              <figcaption>
                <span><b>{i === 0 ? 'Before' : 'After'}</b> · {c.post.createdAt ? fmtShort(c.post.createdAt.toDate()) : ''}</span>
                {c.post.weightKg != null && <b>{fmtWeight(units, c.post.weightKg)}</b>}
              </figcaption>
            </figure>
          ))}
          {chosen[0].post.createdAt && chosen[1].post.createdAt && (
            <div style={{ gridColumn: '1 / -1' }} className="small muted center">
              {Math.round((chosen[1].post.createdAt.toMillis() - chosen[0].post.createdAt.toMillis()) / 86400000)} days apart
              {chosen[0].post.weightKg != null && chosen[1].post.weightKg != null && <> · {fmtWeight(units, chosen[1].post.weightKg - chosen[0].post.weightKg, true)}</>}
            </div>
          )}
        </div>
      ) : (
        <div className="pgrid">
          {items.map((it) => {
            const n = sel.indexOf(it.key);
            return (
              <button key={it.key} className={n >= 0 ? 'sel' : ''} onClick={() => (items.length >= 2 ? pick(it.key) : setZoom(it.ph.url))} onDoubleClick={() => setZoom(it.ph.url)}>
                <img src={it.ph.url} alt="" loading="lazy" />
                {n >= 0 && <span className="selno">{n + 1}</span>}
                <span className="cap">
                  <span>{it.post.createdAt ? fmtShort(it.post.createdAt.toDate()) : '…'}</span>
                  {it.post.weightKg != null && <span>{fmtWeight(units, it.post.weightKg)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </Panel>
  );
}

export type { Post };
