import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deletePost, displayName, updatePost } from '../data/api';
import type { Post, StrengthSet, UserProfile } from '../data/types';
import { useAction } from '../hooks/useAction';
import { useSession } from '../hooks/useSession';
import { fmtDay, fmtDuration, relTime } from '../lib/dates';
import { ACTIVITY_TYPES } from '../lib/nutrition';
import { fmtDist, fmtElev, fmtNum, fmtPace, fmtSpeed, fmtWeight } from '../lib/units';
import { Reactions } from './Reactions';
import { RouteTrace } from './RouteTrace';
import { ActionButton, Avatar, Lightbox, Meter, useToast } from './ui';

export function PostCard({ post, author, names, isNew }: {
  post: Post; author: UserProfile | undefined; names: Map<string, string>; isNew?: boolean;
}) {
  const { user } = useSession();
  const mine = post.authorId === user?.uid;
  const [menu, setMenu] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.text);
  const toast = useToast();
  const del = useAction(async () => { await deletePost(post); toast('Post deleted'); });
  const save = useAction(async () => { await updatePost(post.id, { text }); setEditing(false); });
  const prog = useAction(async () => updatePost(post.id, { progress: !post.progress }));
  const vis = useAction(async () => updatePost(post.id, { visibility: post.visibility === 'friends' ? 'private' : 'friends' }));
  const created = post.createdAt?.toDate?.() ?? null;
  const kindLabel = post.kind === 'day' ? (post.day?.onTarget ? 'DAY ✓' : 'DAY') : post.kind === 'activity'
    ? ACTIVITY_TYPES[post.activity?.type ?? 'other'].glyph : post.kind === 'photo' ? (post.progress ? 'PROGRESS' : 'PHOTO') : 'STATUS';

  return (
    <article className={`post ${isNew ? 'enter' : ''}`}>
      <header className="post-h">
        <Link to={`/u/${post.authorId}`}><Avatar p={author} size={28} /></Link>
        <div className="grow col" style={{ gap: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <Link to={`/u/${post.authorId}`} className="who trunc">{mine ? 'YOU' : displayName(author)}</Link>
            <span className={`post-kind ${post.kind} ${post.kind === 'day' && !post.day?.onTarget ? 'miss' : ''}`}>{kindLabel}</span>
          </div>
          <span className="meta">{relTime(created)}{post.visibility === 'private' ? ' · ONLY YOU' : ''}</span>
        </div>
        {mine && (
          <button className="btn ghost sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Post options">⋯</button>
        )}
      </header>
      {mine && menu && (
        <div className="panel-f" style={{ borderTop: 0, borderBottom: '1px solid var(--rule)' }}>
          <button className="btn sm" onClick={() => { setEditing(true); setMenu(false); }}>EDIT TEXT</button>
          {post.photos.length > 0 && (
            <ActionButton size="sm" state={prog.state} onClick={() => prog.run()} doneLabel="SAVED">
              {post.progress ? 'UNMARK PROGRESS' : 'MARK AS PROGRESS'}
            </ActionButton>
          )}
          <ActionButton size="sm" state={vis.state} onClick={() => vis.run()} doneLabel="SAVED">
            {post.visibility === 'friends' ? 'MAKE PRIVATE' : 'SHARE WITH FRIENDS'}
          </ActionButton>
          <span className="grow" />
          <ActionButton size="sm" variant="danger" state={del.state} onClick={() => confirm('Delete this post?') && del.run()} pendingLabel="DELETING">
            DELETE
          </ActionButton>
        </div>
      )}
      <div className="post-b">
        {post.kind === 'day' && post.day && <DayBlock d={post.day} />}
        {post.kind === 'activity' && post.activity && <ActivityBlock a={post.activity} />}
        {editing ? (
          <div className="col">
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} autoFocus />
            <div className="row">
              <ActionButton size="sm" variant="primary" state={save.state} onClick={() => save.run()}>SAVE</ActionButton>
              <button className="btn sm ghost" onClick={() => { setEditing(false); setText(post.text); }}>CANCEL</button>
            </div>
          </div>
        ) : post.text ? (
          <div className="post-text">{post.text}</div>
        ) : null}
        {post.weightKg != null && <WeightTag kg={post.weightKg} />}
        {post.photos.length > 0 && (
          <div className={`photos n${Math.min(post.photos.length, 4)}`}>
            {post.photos.slice(0, 4).map((ph) => (
              <img key={ph.path} src={ph.url} alt="" loading="lazy" width={ph.w} height={ph.h} onClick={() => setZoom(ph.url)} />
            ))}
          </div>
        )}
      </div>
      {post.visibility === 'friends' || mine ? <Reactions postId={post.id} names={names} /> : null}
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </article>
  );
}

function WeightTag({ kg }: { kg: number }) {
  const { units } = useSession();
  return <div className="small"><span className="muted">WEIGHT AT POST › </span><b>{fmtWeight(units, kg)}</b></div>;
}

function DayBlock({ d }: { d: NonNullable<Post['day']> }) {
  const pct = d.budget ? Math.round((d.kcal / d.budget) * 100) : 0;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row between wrap">
        <span className={`stamp ${d.onTarget ? '' : 'miss'}`}>{d.onTarget ? 'ON TARGET' : 'LOGGED'}</span>
        <span className="small muted">{fmtDay(d.date)} · {d.date}</span>
      </div>
      <div className="stats c3" style={{ border: '1px solid var(--rule)', borderRight: 0, borderBottom: 0 }}>
        <div className="stat"><div className="k">KCAL</div><div className="v">{fmtNum(d.kcal)}</div><div className="s">{pct}% of {fmtNum(d.budget)}</div></div>
        <div className="stat"><div className="k">STREAK</div><div className="v">{d.streak}<small> D</small></div><div className="s">{d.onTarget ? 'kept alive' : '—'}</div></div>
        <div className="stat"><div className="k">P / C / F</div><div className="v" style={{ fontSize: 15 }}>{d.protein ?? '—'}/{d.carbs ?? '—'}/{d.fat ?? '—'}<small> g</small></div></div>
      </div>
      <Meter value={d.kcal} max={Math.max(d.budget * 1.25, d.kcal)} cls={d.onTarget ? 'ok' : d.kcal > d.budget ? 'over' : ''} ticks={[d.budget]} />
    </div>
  );
}

export function ActivityBlock({ a }: { a: NonNullable<Post['activity']> }) {
  const { units } = useSession();
  const t = ACTIVITY_TYPES[a.type];
  const pace = a.type === 'ride' ? fmtSpeed(units, a.distanceM, a.durationSec) : fmtPace(units, a.distanceM, a.durationSec);
  return (
    <div className="col" style={{ gap: 10 }}>
      <h3 style={{ fontSize: 14 }}>{a.title || t.label}</h3>
      <div className="stats c4" style={{ border: '1px solid var(--rule)', borderRight: 0, borderBottom: 0 }}>
        {a.distanceM > 0 && <div className="stat"><div className="k">DIST</div><div className="v">{fmtDist(units, a.distanceM)}</div></div>}
        <div className="stat"><div className="k">TIME</div><div className="v">{fmtDuration(a.durationSec)}</div></div>
        {a.distanceM > 0 && <div className="stat"><div className="k">{a.type === 'ride' ? 'SPEED' : 'PACE'}</div><div className="v">{pace}</div></div>}
        {a.elevationM > 0 && <div className="stat"><div className="k">ELEV</div><div className="v">{fmtElev(units, a.elevationM)}</div></div>}
        <div className="stat"><div className="k">KCAL</div><div className="v">{fmtNum(a.kcal)}</div></div>
      </div>
      {a.route?.length > 3 && <RouteTrace route={a.route} h={180} />}
      {a.exercises?.length > 0 && <ExerciseTable rows={a.exercises} />}
    </div>
  );
}

export function ExerciseTable({ rows }: { rows: StrengthSet[] }) {
  const { units } = useSession();
  return (
    <table className="kv" style={{ border: '1px solid var(--rule)' }}>
      <thead><tr><th>EXERCISE</th><th className="n">SETS×REPS</th><th className="n">LOAD</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}><td>{r.name}</td><td className="n">{r.sets}×{r.reps}</td><td className="n">{r.weightKg ? fmtWeight(units, r.weightKg) : 'BW'}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
