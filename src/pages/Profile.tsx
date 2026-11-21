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
import {
  ActionButton, Avatar, Empty, Lightbox, Panel, Seg, Skeleton, VisBadge, useToast,
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
        <Empty title="NOT CONNECTED">You can only view profiles of friends. <Link to="/friends">Friends →</Link></Empty>
      </div>
    );
  }
  if (prof.loading || !prof.data) {
    return <div className="page"><Skeleton h={120} label="LOADING PROFILE" /><Skeleton h={200} label="LOADING STATS" /></div>;
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
    toast(`${LABELS[k]} → ${next[k] ? 'visible to friends' : 'private'}`);
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
        <div className="k">{label}</div>
        <div className="v">{hidden ? <span className="faint">░░░░</span> : value}</div>
        {(sub || hidden) && <div className="s">{hidden ? 'private' : sub}</div>}
        {self && <div style={{ marginTop: 6 }}>{k ? badge(k) : <span className="vis priv">○ NEVER SHARED</span>}</div>}
      </div>
    );
  };

  return (
    <div className="page">
      <Header p={p} self={self} />

      <Panel title="CONSISTENCY" idx="01" tight right={<VisBadge pub />}>
        <div className="stats c4">
          <div className="stat"><div className="k">STREAK</div><div className="v">{stats.streak}<small> D</small></div><div className="s">best {stats.bestStreak} d</div></div>
          <div className="stat"><div className="k">DAYS ON TARGET</div><div className="v">{stats.daysOnTarget}</div><div className="s">{stats.lastClosedDay ? `last ${fmtShort(parseKey(stats.lastClosedDay))}` : 'none closed'}</div></div>
          <div className="stat"><div className="k">WORKOUTS</div><div className="v">{stats.workouts}</div><div className="s">{fmtDuration(stats.activeSec)} total</div></div>
          <div className="stat"><div className="k">DISTANCE</div><div className="v">{fmtDist(units, stats.distanceM)}</div><div className="s">all time</div></div>
        </div>
      </Panel>

      <Panel title="BODY" idx="02" tight right={self ? <span className="muted small">TAP BADGES TO SHARE</span> : undefined}>
        <div className="stats c3 m2">
          {cell('currentWeight', 'CURRENT', fmtWeight(units, body.current), body.current == null ? 'no weigh-in yet' : undefined)}
          {cell('targetWeight', 'TARGET', fmtWeight(units, body.target), toGo != null ? `${fmtWeight(units, toGo, true)} to go` : undefined)}
          {cell('startWeight', 'START', fmtWeight(units, body.start))}
          {cell('weightChange', 'CHANGE', fmtWeight(units, body.change, true), 'since start')}
          {cell('height', 'HEIGHT', fmtHeight(units, body.height))}
          {cell('calorieGoal', 'KCAL GOAL', body.kcal ? `${fmtNum(body.kcal)}` : '—', 'per day')}
          {self && cell(null, 'BMI', bmi ? fmtNum(bmi, 1) : '—')}
        </div>
      </Panel>

      <Panel title="WEIGHT HISTORY" idx="03" right={self ? badge('weightHistory') : undefined}>
        {!canWeights ? <PrivateNote what="weight history" /> : weights.loading ? <Skeleton h={180} /> : (
          <WeightChart data={weights.data} target={body.target} />
        )}
      </Panel>

      <Panel title="FOOD LOG · CALORIES" idx="04" right={self ? badge('diary') : undefined}>
        {!canDiary ? <PrivateNote what="food log" /> : <CalorieHistory uid={p.uid} />}
      </Panel>

      <Panel title="ACTIVITY" idx="05" tight right={self ? badge('activities') : undefined}>
        {!canActs ? <div className="panel-b"><PrivateNote what="activity history" /></div> : <ActivitySection uid={p.uid} self={self} />}
      </Panel>

      <ProgressPhotos uid={p.uid} />
    </div>
  );
}

function PrivateNote({ what }: { what: string }) {
  return <div className="empty"><b>○ PRIVATE</b>This friend hasn't shared their {what}.</div>;
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
      <div className="row top" style={{ padding: 12, gap: 14 }}>
        <Avatar p={p} size={76} />
        <div className="grow col" style={{ gap: 4 }}>
          <h1 style={{ textTransform: 'none', fontSize: 20 }} className="trunc">{displayName(p)}</h1>
          {p.nickname && p.nickname !== p.displayName && <div className="small muted">{p.displayName}</div>}
          {editing ? (
            <div className="col" style={{ gap: 6 }}>
              <input value={status} maxLength={80} autoFocus placeholder="short status, e.g. cutting for summer" onChange={(e) => setStatus(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save.run()} />
              <div className="row">
                <ActionButton size="sm" variant="primary" state={save.state} onClick={() => save.run()}>SAVE</ActionButton>
                <button className="btn sm ghost" onClick={() => { setEditing(false); setStatus(p.status); }}>CANCEL</button>
                <span className="small muted">{status.length}/80</span>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              <span className={p.status ? '' : 'faint'}>&gt; {p.status || (self ? 'set a status' : '—')}</span>
              {self && <button className="btn ghost sm" onClick={() => setEditing(true)} aria-label="Edit status">✎</button>}
            </div>
          )}
          <div className="small muted">ACTIVE {relTime(p.lastActiveAt?.toDate?.())}</div>
        </div>
      </div>
      {self && (
        <div className="panel-f">
          <Link className="btn sm" to="/settings">EDIT PROFILE & GOALS</Link>
          <Link className="btn sm" to="/emojis">CUSTOM EMOJIS</Link>
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
  if (!data.length) return <Empty title="NO WEIGH-INS">Log weight from the LOG tab.</Empty>;
  const first = pts[0]?.y, last = pts[pts.length - 1]?.y;
  return (
    <div className="col">
      <div className="row between wrap">
        <Seg<Range> value={range} onChange={setRange} options={[{ v: '30', l: '30D' }, { v: '90', l: '90D' }, { v: '365', l: '1Y' }, { v: 'all', l: 'ALL' }]} />
        {pts.length > 1 && <span className="small">Δ <b>{fmtNum(last - first, 1)} {weightUnit(units)}</b> <span className="muted">in range</span></span>}
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
      tip: !d ? 'no log' : !d.closed ? 'open' : d.onTarget ? 'on target' : 'off target',
    };
  });
  const closed = days.data.filter((d) => d.closed);
  const on = closed.filter((d) => d.onTarget).length;
  return (
    <div className="col">
      <div className="row between wrap">
        <Seg value={view} onChange={setView} options={[{ v: 'grid', l: '12 WEEKS' }, { v: 'bars', l: '30 DAYS' }]} />
        <span className="small"><b>{on}</b>/<span>{closed.length}</span> <span className="muted">closed days on target</span></span>
      </div>
      {view === 'bars' ? <BarChart data={last30} unit="kcal" /> : <DayGrid byDate={byDate} />}
      <div className="row wrap small muted" style={{ gap: 12 }}>
        <span><span className="ok">■</span> on target</span>
        <span><span className="bad">■</span> over</span>
        <span><span className="warn">■</span> under</span>
        <span><span className="faint">□</span> open / not logged</span>
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
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gap: 3, justifyContent: 'start' }}>
        {cells.map((k) => {
          const d = byDate.get(k);
          const kcal = d?.totals?.kcal ?? 0;
          const color = !d?.closed ? (d?.entries?.length ? 'var(--rule)' : 'transparent') : d.onTarget ? 'var(--ok)' : kcal > (d.budget ?? 0) ? 'var(--bad)' : 'var(--warn)';
          return (
            <button
              key={k}
              onClick={() => setSel(k)}
              title={k}
              style={{ width: 16, height: 16, padding: 0, border: `1px solid ${k === sel ? 'var(--accent)' : 'var(--faint)'}`, background: color, cursor: 'pointer' }}
            />
          );
        })}
      </div>
      <div className="small">{sel ? <>› {sel}: {s ? `${fmtNum(s.totals?.kcal ?? 0)} / ${fmtNum(s.budget ?? 0)} kcal · ${s.closed ? (s.onTarget ? 'on target' : 'off target') : 'open'}` : 'no log'}</> : <span className="muted">› tap a day</span>}</div>
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
  if (acts.loading) return <div className="panel-b"><Skeleton h={140} /></div>;
  if (!acts.data.length) return <div className="panel-b"><Empty title="NO ACTIVITIES YET" /></div>;
  return (
    <>
      <div className="panel-b"><BarChart data={weekly} unit="min/week" h={120} /></div>
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
      title="PROGRESS PHOTOS"
      idx="06"
      right={<span className="muted">{items.length}</span>}
      footer={items.length >= 2 ? (
        <>
          <Seg value={mode} onChange={setMode} options={[{ v: 'grid', l: 'TIMELINE' }, { v: 'compare', l: 'COMPARE' }]} />
          <span className="small muted">{mode === 'grid' ? `select 2 to compare (${sel.length}/2)` : sel.length === 2 ? 'your selection' : 'first vs latest'}</span>
        </>
      ) : undefined}
    >
      {posts.loading ? <Skeleton h={160} /> : items.length === 0 ? (
        <Empty title="NO PROGRESS PHOTOS">{uid === me ? 'Post a photo from the feed with PROGRESS on to start your timeline.' : 'Nothing shared yet.'}</Empty>
      ) : mode === 'compare' && chosen.length === 2 ? (
        <div className="compare">
          {chosen.map((c, i) => (
            <figure key={c.key}>
              <img src={c.ph.url} alt="" onClick={() => setZoom(c.ph.url)} style={{ cursor: 'zoom-in' }} />
              <figcaption>
                <span>{i === 0 ? 'BEFORE' : 'AFTER'} · {c.post.createdAt ? fmtShort(c.post.createdAt.toDate()) : ''}</span>
                {c.post.weightKg != null && <b>{fmtWeight(units, c.post.weightKg)}</b>}
              </figcaption>
            </figure>
          ))}
          {chosen[0].post.createdAt && chosen[1].post.createdAt && (
            <div style={{ gridColumn: '1 / -1', background: 'var(--paper)', padding: '6px 8px' }} className="small">
              Δ {Math.round((chosen[1].post.createdAt.toMillis() - chosen[0].post.createdAt.toMillis()) / 86400000)} DAYS
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
