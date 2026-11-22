import { useEffect, useMemo, useRef, useState } from 'react';
import { limit, orderBy, query } from 'firebase/firestore';
import { createActivity, uploadPostPhotos, weightsCol } from '../data/api';
import type { ActivityType, StrengthSet, Visibility, WeightEntry } from '../data/types';
import { useAction } from '../hooks/useAction';
import { useQuery } from '../hooks/useFirestore';
import { useMe } from '../hooks/useSession';
import { toLocalInput } from '../lib/dates';
import { encodeRoute, type GeoPoint } from '../lib/geo';
import { ACTIVITY_TYPES, estimateKcal } from '../lib/nutrition';
import { distUnit, fmtNum, kgTo, mTo, toKg, toM, weightUnit } from '../lib/units';
import { EmojiField } from './EmojiText';
import { RouteTrace } from './RouteTrace';
import { ActionButton, ErrorLine, Icon, Modal, NumInput, Seg, Toggle, UploadProgress, useToast } from './ui';

export interface ActivityDraft {
  type?: ActivityType;
  title?: string;
  startedAt?: Date;
  durationSec?: number;
  distanceM?: number;
  elevationM?: number;
  points?: GeoPoint[];
}

export function useLatestWeightKg(): number {
  const { uid, settings } = useMe();
  const w = useQuery<WeightEntry>(query(weightsCol(uid), orderBy('date', 'desc'), limit(1)), `lw:${uid}`);
  return w.data[0]?.kg ?? settings.startWeightKg ?? 75;
}

export function ActivityForm({ draft, onClose, onSaved }: { draft?: ActivityDraft; onClose: () => void; onSaved?: () => void }) {
  const { uid, units } = useMe();
  const toast = useToast();
  const weightKg = useLatestWeightKg();
  const [type, setType] = useState<ActivityType>(draft?.type ?? 'run');
  const [title, setTitle] = useState(draft?.title ?? '');
  const [start, setStart] = useState(toLocalInput(draft?.startedAt ?? new Date(Date.now() - (draft?.durationSec ?? 1800) * 1000)));
  const d0 = draft?.durationSec ?? 1800;
  const [hh, setHh] = useState<number | ''>(Math.floor(d0 / 3600));
  const [mm, setMm] = useState<number | ''>(Math.floor((d0 % 3600) / 60));
  const [ss, setSs] = useState<number | ''>(d0 % 60);
  const [dist, setDist] = useState<number | ''>(draft?.distanceM ? Math.round(mTo(units, draft.distanceM) * 100) / 100 : '');
  const [elev, setElev] = useState<number | ''>(draft?.elevationM ? Math.round(units === 'imperial' ? draft.elevationM * 3.28084 : draft.elevationM) : '');
  const [kcalOverride, setKcalOverride] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<StrengthSet[]>([]);
  const [vis, setVis] = useState<Visibility>('friends');
  const [share, setShare] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [pct, setPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = ACTIVITY_TYPES[type];

  const durationSec = (Number(hh) || 0) * 3600 + (Number(mm) || 0) * 60 + (Number(ss) || 0);
  const distanceM = meta.distance && dist !== '' ? toM(units, dist) : 0;
  const elevationM = elev === '' ? 0 : units === 'imperial' ? elev / 3.28084 : elev;
  const estimated = estimateKcal(type, durationSec, weightKg, distanceM);
  const kcal = kcalOverride === '' ? estimated : kcalOverride;
  const route = useMemo(() => (draft?.points?.length ? encodeRoute(draft.points) : []), [draft?.points]);

  useEffect(() => { if (type !== 'strength' && type !== 'hiit') setExercises([]); }, [type]);

  const save = useAction(async () => {
    if (durationSec <= 0) throw new Error('Duration is required');
    const startedAt = new Date(start);
    if (Number.isNaN(startedAt.getTime())) throw new Error('Invalid start time');
    setPct(0);
    const photos = share && files.length ? await uploadPostPhotos(uid, files, setPct) : [];
    await createActivity(uid, {
      type,
      title: title.trim() || defaultTitle(type, startedAt),
      startedAt,
      date: '',
      durationSec,
      distanceM: Math.round(distanceM),
      elevationM: Math.round(elevationM),
      kcal: Math.round(kcal),
      notes: notes.trim(),
      route,
      exercises: exercises.filter((e) => e.name.trim()),
      visibility: vis,
    }, { share: share && vis === 'friends', photos });
    return true;
  });

  return (
    <Modal title="Log exercise" onClose={onClose}>
      <div className="row wrap" style={{ gap: 4 }}>
        {(Object.keys(ACTIVITY_TYPES) as ActivityType[]).map((t) => (
          <button key={t} className={`btn sm ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>{ACTIVITY_TYPES[t].glyph} {ACTIVITY_TYPES[t].label}</button>
        ))}
      </div>
      {route.length > 0 && <RouteTrace route={route} h={160} />}
      <div className="fgrid">
        <label className="f"><span>Title</span><input value={title} placeholder={defaultTitle(type, new Date(start))} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="f"><span>Start</span><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      </div>
      <div>
        <div className="flabel" style={{ marginBottom: 4 }}>Duration</div>
        <div className="row">
          <NumInput value={hh} onChange={setHh} unit="h" ariaLabel="hours" />
          <NumInput value={mm} onChange={setMm} unit="m" ariaLabel="minutes" />
          <NumInput value={ss} onChange={setSs} unit="s" ariaLabel="seconds" />
        </div>
      </div>
      <div className="fgrid">
        {meta.distance && <label className="f"><span>Distance</span><NumInput value={dist} onChange={setDist} unit={distUnit(units)} /></label>}
        {meta.distance && <label className="f"><span>Elevation gain</span><NumInput value={elev} onChange={setElev} unit={units === 'imperial' ? 'ft' : 'm'} /></label>}
        <label className="f">
          <span>Calories burned {kcalOverride === '' ? '(estimated)' : ''}</span>
          <NumInput value={kcalOverride} onChange={setKcalOverride} unit="kcal" placeholder={String(estimated)} />
        </label>
      </div>
      {(type === 'strength' || type === 'hiit') && <ExerciseEditor rows={exercises} onChange={setExercises} />}
      <label className="f"><span>Notes</span><EmojiField multiline value={notes} maxLength={1000} placeholder="How did it feel?" onChange={setNotes} /></label>
      <div className="col" style={{ background: 'var(--soft)', borderRadius: 10, padding: 12, gap: 12 }}>
        <Seg<Visibility> value={vis} onChange={setVis} options={[{ v: 'friends', l: '👥 Friends can see' }, { v: 'private', l: '🔒 Only me' }]} />
        {vis === 'friends' && <Toggle on={share} onChange={setShare} label="Post to feed" />}
        {vis === 'friends' && share && (
          <div className="row wrap">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { setFiles(Array.from(e.target.files ?? []).slice(0, 4)); e.target.value = ''; }} />
            <button className="btn sm" onClick={() => fileRef.current?.click()}><Icon name="camera" size={16} /> Add photos</button>
            <span className="small muted">{files.length ? `${files.length} selected` : 'Optional, up to 4'}</span>
          </div>
        )}
      </div>
      {save.state === 'pending' && files.length > 0 && <UploadProgress pct={pct} />}
      <ErrorLine>{save.error}</ErrorLine>
      <div className="row between">
        <span className="small muted">{fmtNum(durationSec / 60)} min · {fmtNum(kcal)} kcal</span>
        <ActionButton variant="primary" state={save.state} pendingLabel="Saving…" onClick={async () => {
          if (await save.run()) {
            toast(`${meta.label} saved · ${fmtNum(kcal)} kcal burned`);
            onSaved?.();
            onClose();
          }
        }}>Save</ActionButton>
      </div>
    </Modal>
  );
}

function defaultTitle(type: ActivityType, d: Date) {
  const h = d.getHours();
  const part = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
  return `${part} ${ACTIVITY_TYPES[type].label}`;
}

function ExerciseEditor({ rows, onChange }: { rows: StrengthSet[]; onChange: (r: StrengthSet[]) => void }) {
  const { units } = useMe();
  const set = (i: number, patch: Partial<StrengthSet>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="col">
      <div className="flabel">Exercises</div>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ gap: 4 }}>
          <input style={{ flex: 3 }} placeholder="e.g. Squat" value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="exercise" />
          <div style={{ flex: 1.3 }}><NumInput value={r.sets || ''} onChange={(v) => set(i, { sets: Number(v) || 0 })} unit="×" ariaLabel="sets" /></div>
          <div style={{ flex: 1.3 }}><NumInput value={r.reps || ''} onChange={(v) => set(i, { reps: Number(v) || 0 })} unit="r" ariaLabel="reps" /></div>
          <div style={{ flex: 1.8 }}><NumInput value={r.weightKg ? Math.round(kgTo(units, r.weightKg) * 10) / 10 : ''} onChange={(v) => set(i, { weightKg: v === '' ? 0 : toKg(units, v) })} unit={weightUnit(units)} ariaLabel="load" /></div>
          <button className="icon-btn" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="remove"><Icon name="close" size={16} /></button>
        </div>
      ))}
      <button className="btn sm" onClick={() => onChange([...rows, { name: '', sets: 3, reps: 10, weightKg: 0 }])}>+ Add exercise</button>
    </div>
  );
}
