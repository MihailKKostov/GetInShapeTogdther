import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActivityType } from '../data/types';
import { ActivityForm, type ActivityDraft } from '../components/ActivityForm';
import { RouteTrace } from '../components/RouteTrace';
import { ErrorLine, Panel, Spinner } from '../components/ui';
import { useMe } from '../hooks/useSession';
import { fmtDuration } from '../lib/dates';
import { elevationGain, haversine, pathDistance, type GeoPoint } from '../lib/geo';
import { ACTIVITY_TYPES } from '../lib/nutrition';
import { distUnit, fmtElev, fmtNum, fmtPace, fmtSpeed, mTo } from '../lib/units';
import { useWakeLock } from './Activities';

type Status = 'idle' | 'acquiring' | 'recording' | 'paused';
const STORE = 'gist.recording.v1';

interface Saved { type: ActivityType; points: GeoPoint[]; elapsed: number; startedAt: number }

function loadSaved(): Saved | null {
  try { const s = localStorage.getItem(STORE); return s ? (JSON.parse(s) as Saved) : null; } catch { return null; }
}

export default function Record() {
  const { units } = useMe();
  const nav = useNavigate();
  const saved = useRef(loadSaved());
  const [type, setType] = useState<ActivityType>(saved.current?.type ?? 'run');
  const [status, setStatus] = useState<Status>(saved.current ? 'paused' : 'idle');
  const [points, setPoints] = useState<GeoPoint[]>(saved.current?.points ?? []);
  const [elapsed, setElapsed] = useState(saved.current?.elapsed ?? 0);
  const [startedAt, setStartedAt] = useState<number>(saved.current?.startedAt ?? 0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);
  const watch = useRef<number | null>(null);
  const tick = useRef<number | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useWakeLock(status === 'recording' || status === 'acquiring');

  // persist so a reload or accidental tab close doesn't lose the session
  useEffect(() => {
    if (status === 'idle') return;
    try { localStorage.setItem(STORE, JSON.stringify({ type, points, elapsed, startedAt })); } catch { /* ignore */ }
  }, [type, points, elapsed, startedAt, status]);

  const stopWatch = () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    if (tick.current != null) clearInterval(tick.current);
    tick.current = null;
  };
  useEffect(() => stopWatch, []);

  const begin = () => {
    if (!('geolocation' in navigator)) { setErr('This browser has no GPS access'); return; }
    setErr(null);
    setStatus('acquiring');
    if (!startedAt) setStartedAt(Date.now());
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc, altitude } = pos.coords;
        setAccuracy(acc);
        if (acc > 35) return;
        if (statusRef.current === 'acquiring') {
          setStatus('recording');
          if (tick.current == null) tick.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
        }
        if (statusRef.current === 'paused') return;
        const p: GeoPoint = { lat: latitude, lng: longitude, ele: altitude ?? undefined, t: pos.timestamp };
        setPoints((pts) => {
          const last = pts[pts.length - 1];
          if (last) {
            const d = haversine(last, p);
            const dt = Math.max(1, ((p.t ?? 0) - (last.t ?? 0)) / 1000);
            if (d < 4) return pts;
            if (d / dt > 35) return pts; // implausible jump
          }
          return [...pts, p];
        });
      },
      (e) => {
        setErr(e.code === e.PERMISSION_DENIED ? 'Location permission denied — enable it in your browser settings' : e.message);
        if (statusRef.current === 'acquiring') setStatus(points.length ? 'paused' : 'idle');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
  };

  const pause = () => { stopWatch(); setStatus('paused'); };
  const finish = () => {
    stopWatch();
    setDraft({
      type,
      startedAt: new Date(startedAt || Date.now() - elapsed * 1000),
      durationSec: elapsed,
      distanceM: Math.round(pathDistance(points)),
      elevationM: elevationGain(points),
      points,
    });
    setStatus('paused');
  };
  const discard = () => {
    if (!confirm('Discard this recording?')) return;
    stopWatch();
    try { localStorage.removeItem(STORE); } catch { /* ignore */ }
    setPoints([]); setElapsed(0); setStartedAt(0); setStatus('idle');
  };

  const dist = pathDistance(points);
  // pace over the last ~60 s
  const recent = (() => {
    const now = points[points.length - 1]?.t ?? 0;
    const win = points.filter((p) => (p.t ?? 0) >= now - 60000);
    const dt = win.length > 1 ? ((win[win.length - 1].t ?? 0) - (win[0].t ?? 0)) / 1000 : 0;
    return { d: pathDistance(win), dt };
  })();
  const meta = ACTIVITY_TYPES[type];
  const speedish = type === 'ride';

  return (
    <div className="page">
      <div className="row between">
        <button className="btn sm" onClick={() => nav('/move')}>← ACTIVITIES</button>
        <span className="small">
          {status === 'recording' && <><span className="rec-dot" /> REC</>}
          {status === 'acquiring' && <><Spinner /> ACQUIRING GPS</>}
          {status === 'paused' && 'PAUSED'}
          {status === 'idle' && 'READY'}
          {accuracy != null && <span className="muted"> · ±{Math.round(accuracy)}m</span>}
        </span>
      </div>

      {status === 'idle' && (
        <div className="row wrap" style={{ gap: 4 }}>
          {(['run', 'ride', 'walk', 'hike'] as ActivityType[]).map((t) => (
            <button key={t} className={`btn ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>{ACTIVITY_TYPES[t].label}</button>
          ))}
        </div>
      )}

      <Panel title={meta.label} idx="●" tight>
        <div className="stats c2">
          <div className="stat"><div className="k">TIME</div><div className="rec-big">{fmtDuration(elapsed)}</div></div>
          <div className="stat"><div className="k">DISTANCE</div><div className="rec-big">{fmtNum(mTo(units, dist), 2)}<small style={{ fontSize: 14 }} className="muted"> {distUnit(units)}</small></div></div>
          <div className="stat"><div className="k">{speedish ? 'SPEED · 60S' : 'PACE · 60S'}</div><div className="v">{speedish ? fmtSpeed(units, recent.d, recent.dt) : fmtPace(units, recent.d, recent.dt)}</div></div>
          <div className="stat"><div className="k">{speedish ? 'AVG SPEED' : 'AVG PACE'}</div><div className="v">{speedish ? fmtSpeed(units, dist, elapsed) : fmtPace(units, dist, elapsed)}</div></div>
          <div className="stat"><div className="k">ELEV GAIN</div><div className="v">{fmtElev(units, elevationGain(points))}</div></div>
          <div className="stat"><div className="k">POINTS</div><div className="v">{points.length}</div></div>
        </div>
      </Panel>

      <RouteTrace points={points} h={260} live />
      <ErrorLine>{err}</ErrorLine>

      <div className="row" style={{ gap: 8 }}>
        {status === 'idle' && <button className="btn accent lg block" onClick={begin}>● START</button>}
        {(status === 'recording' || status === 'acquiring') && <button className="btn primary lg block" onClick={pause}>❚❚ PAUSE</button>}
        {status === 'paused' && (
          <>
            <button className="btn lg" onClick={discard}>DISCARD</button>
            <button className="btn lg grow" onClick={begin}>▶ RESUME</button>
            <button className="btn accent lg grow" onClick={finish} disabled={elapsed < 1}>■ FINISH</button>
          </>
        )}
      </div>
      <p className="small muted">Keep this tab open with the screen on while recording — browsers pause GPS for background tabs. Your progress is saved on this device if the page reloads.</p>

      {draft && (
        <ActivityForm
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            try { localStorage.removeItem(STORE); } catch { /* ignore */ }
            nav('/move');
          }}
        />
      )}
    </div>
  );
}
