import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { limit, orderBy, query } from 'firebase/firestore';
import { activitiesCol, deleteActivity, updateActivityMeta } from '../data/api';
import type { Activity, Visibility } from '../data/types';
import { ActivityForm, type ActivityDraft } from '../components/ActivityForm';
import { BarChart } from '../components/Charts';
import { ExerciseTable } from '../components/PostCard';
import { RouteTrace } from '../components/RouteTrace';
import {
  ActionButton, Empty, ErrorLine, Modal, Panel, Seg, Skeleton, useToast,
} from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useQuery } from '../hooks/useFirestore';
import { useMe } from '../hooks/useSession';
import { addDays, dateKey, fmtDay, fmtDuration, fmtShort, parseKey } from '../lib/dates';
import { parseGpx } from '../lib/geo';
import { ACTIVITY_TYPES } from '../lib/nutrition';
import { fmtDist, fmtElev, fmtNum, fmtPace, fmtSpeed } from '../lib/units';

export function weekStart(key: string) {
  const d = parseKey(key);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(key, -dow);
}

export function weeklyMinutes(acts: Pick<Activity, 'date' | 'durationSec'>[], weeks = 12) {
  const thisWeek = weekStart(dateKey());
  const buckets = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i--) buckets.set(addDays(thisWeek, -7 * i), 0);
  for (const a of acts) {
    const w = weekStart(a.date);
    if (buckets.has(w)) buckets.set(w, buckets.get(w)! + a.durationSec / 60);
  }
  return [...buckets.entries()].map(([k, v]) => ({ key: k, label: fmtShort(parseKey(k)), value: Math.round(v) }));
}

export default function Activities() {
  const { uid, units } = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const acts = useQuery<Activity>(query(activitiesCol(uid), orderBy('startedAt', 'desc'), limit(200)), `acts:${uid}`);
  const [form, setForm] = useState<ActivityDraft | null>(null);
  const [open, setOpen] = useState<Activity | null>(null);
  const [gpxErr, setGpxErr] = useState<string | null>(null);
  const gpxRef = useRef<HTMLInputElement>(null);

  const week = weekStart(dateKey());
  const thisWeek = acts.data.filter((a) => a.date >= week);
  const weekly = useMemo(() => weeklyMinutes(acts.data), [acts.data]);
  const sum = (xs: Activity[], k: 'durationSec' | 'distanceM' | 'kcal') => xs.reduce((s, a) => s + (a[k] || 0), 0);

  const importGpx = async (f: File) => {
    setGpxErr(null);
    try {
      const t = parseGpx(await f.text());
      setForm({
        type: 'run', title: t.name, startedAt: t.startedAt, durationSec: t.durationSec || 1800,
        distanceM: t.distanceM, elevationM: t.elevationM, points: t.points,
      });
      toast(`GPX parsed · ${t.points.length} points`, 'info');
    } catch (e) {
      setGpxErr(e instanceof Error ? e.message : 'Could not read file');
    }
  };

  return (
    <div className="page">
      <div className="row" style={{ gap: 8 }}>
        <button className="btn accent lg grow" onClick={() => nav('/move/record')}><span className="rec-dot" style={{ animation: 'none', background: 'currentColor' }} /> RECORD GPS</button>
        <button className="btn primary lg grow" onClick={() => setForm({})}>+ LOG</button>
        <button className="btn lg" onClick={() => gpxRef.current?.click()} title="Import a GPX file from your watch or another app">GPX ↑</button>
        <input ref={gpxRef} type="file" accept=".gpx,application/gpx+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importGpx(f); e.target.value = ''; }} />
      </div>
      <ErrorLine>{gpxErr}</ErrorLine>

      <Panel title="THIS WEEK" idx="01" tight>
        <div className="stats c4">
          <div className="stat"><div className="k">SESSIONS</div><div className="v">{thisWeek.length}</div></div>
          <div className="stat"><div className="k">TIME</div><div className="v">{fmtDuration(sum(thisWeek, 'durationSec'))}</div></div>
          <div className="stat"><div className="k">DISTANCE</div><div className="v">{fmtDist(units, sum(thisWeek, 'distanceM'))}</div></div>
          <div className="stat"><div className="k">KCAL</div><div className="v">{fmtNum(sum(thisWeek, 'kcal'))}</div></div>
        </div>
      </Panel>

      <Panel title="ACTIVE MINUTES / WEEK" idx="02">
        {acts.loading ? <Skeleton h={140} /> : <BarChart data={weekly} unit="min" h={140} />}
      </Panel>

      <Panel title="HISTORY" idx="03" tight right={<span className="muted">{acts.data.length}</span>}>
        {acts.loading ? <div style={{ padding: 10 }}><Skeleton h={120} label="LOADING ACTIVITIES" /></div> : acts.data.length === 0 ? (
          <div style={{ padding: 10 }}><Empty title="NO ACTIVITIES">Record a GPS session, import a GPX file or log one manually.</Empty></div>
        ) : <ActivityList acts={acts.data} onOpen={setOpen} />}
      </Panel>

      {form && <ActivityForm draft={form} onClose={() => setForm(null)} />}
      {open && <ActivityDetail a={open} onClose={() => setOpen(null)} editable />}
    </div>
  );
}

export function ActivityList({ acts, onOpen }: { acts: Activity[]; onOpen: (a: Activity) => void }) {
  const { units } = useMe();
  let last = '';
  return (
    <div>
      {acts.map((a) => {
        const w = weekStart(a.date);
        const sep = w !== last ? (last = w, <div key={`w${w}`} className="list-sep"><span>WEEK OF {fmtShort(parseKey(w))}</span></div>) : null;
        return (
          <div key={a.id}>
            {sep}
            <button className="food-row" onClick={() => onOpen(a)}>
              <span className="nm"><span className="src">{ACTIVITY_TYPES[a.type].glyph}</span>{a.title}</span>
              <span className="kc">{a.distanceM > 0 ? fmtDist(units, a.distanceM) : fmtDuration(a.durationSec)}</span>
              <span className="sub">{fmtDay(a.date)} · {fmtDuration(a.durationSec)} · {fmtNum(a.kcal)} kcal{a.visibility === 'private' ? ' · PRIVATE' : ''}</span>
              <span className="sub right">{a.distanceM > 0 ? (a.type === 'ride' ? fmtSpeed(units, a.distanceM, a.durationSec) : fmtPace(units, a.distanceM, a.durationSec)) : ''}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ActivityDetail({ a, onClose, editable }: { a: Activity; onClose: () => void; editable?: boolean }) {
  const { uid, units } = useMe();
  const toast = useToast();
  const [title, setTitle] = useState(a.title);
  const [notes, setNotes] = useState(a.notes);
  const [vis, setVis] = useState<Visibility>(a.visibility);
  const save = useAction(async () => updateActivityMeta(uid, a.id, { title, notes, visibility: vis }));
  const del = useAction(async () => { await deleteActivity(uid, a); return true; });
  const meta = ACTIVITY_TYPES[a.type];
  return (
    <Modal title={`${meta.glyph} · ${fmtDay(a.date)}`} onClose={onClose}>
      {editable ? <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" /> : <h2 style={{ textTransform: 'none' }}>{a.title}</h2>}
      <div className="stats c3" style={{ border: '1px solid var(--line)', borderRight: 0, borderBottom: 0 }}>
        <div className="stat"><div className="k">TIME</div><div className="v">{fmtDuration(a.durationSec)}</div></div>
        {a.distanceM > 0 && <div className="stat"><div className="k">DISTANCE</div><div className="v">{fmtDist(units, a.distanceM)}</div></div>}
        {a.distanceM > 0 && <div className="stat"><div className="k">{a.type === 'ride' ? 'SPEED' : 'PACE'}</div><div className="v">{a.type === 'ride' ? fmtSpeed(units, a.distanceM, a.durationSec) : fmtPace(units, a.distanceM, a.durationSec)}</div></div>}
        {a.elevationM > 0 && <div className="stat"><div className="k">ELEV GAIN</div><div className="v">{fmtElev(units, a.elevationM)}</div></div>}
        <div className="stat"><div className="k">KCAL</div><div className="v">{fmtNum(a.kcal)}</div></div>
        <div className="stat"><div className="k">START</div><div className="v" style={{ fontSize: 14 }}>{a.startedAt?.toDate?.().toLocaleString()}</div></div>
      </div>
      {a.route?.length > 3 && <RouteTrace route={a.route} h={240} />}
      {a.exercises?.length > 0 && <ExerciseTable rows={a.exercises} />}
      {editable ? (
        <>
          <label className="f"><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <Seg<Visibility> value={vis} onChange={setVis} options={[{ v: 'friends', l: '◉ FRIENDS' }, { v: 'private', l: '○ ONLY ME' }]} />
          <ErrorLine>{save.error || del.error}</ErrorLine>
          <div className="row">
            <ActionButton variant="danger" state={del.state} pendingLabel="DELETING" onClick={async () => {
              if (confirm('Delete this activity and its feed post?') && await del.run()) { toast('Activity deleted'); onClose(); }
            }}>DELETE</ActionButton>
            <span className="grow" />
            <ActionButton variant="primary" state={save.state} onClick={() => save.run()} doneLabel="SAVED">SAVE</ActionButton>
          </div>
        </>
      ) : a.notes ? <p className="post-text">{a.notes}</p> : null}
    </Modal>
  );
}

/** Keep the screen awake during GPS recording where supported. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const req = () => navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    req();
    const vis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => undefined); };
  }, [active]);
}

export { useWakeLock };
