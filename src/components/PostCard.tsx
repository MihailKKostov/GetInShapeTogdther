import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deletePost, displayName, updatePost } from '../data/api';
import type { Post, StrengthSet, UserProfile } from '../data/types';
import { useAction } from '../hooks/useAction';
import { useSession } from '../hooks/useSession';
import { fmtDay, fmtDuration, relTime } from '../lib/dates';
import { ACTIVITY_TYPES } from '../lib/nutrition';
import { fmtDist, fmtElev, fmtNum, fmtPace, fmtSpeed, fmtWeight } from '../lib/units';
import { EmojiField, EmojiText } from './EmojiText';
import { Reactions } from './Reactions';
import { RecipePostBlock } from '../pages/recipes/RecipePost';
import { RouteTrace } from './RouteTrace';
import { ActionButton, Avatar, Icon, Lightbox, Meter, useToast } from './ui';

function action(post: Post, mine: boolean): string {
  const their = mine ? 'your' : 'their';
  switch (post.kind) {
    case 'day': return post.day?.onTarget ? `hit ${their} nutrition target` : `completed ${their} food diary`;
    case 'activity': return `logged a ${ACTIVITY_TYPES[post.activity?.type ?? 'other'].label.toLowerCase()}`;
    case 'photo': return post.progress ? 'shared a progress photo' : 'shared a photo';
    case 'recipe': return 'shared a recipe';
    default: return 'posted an update';
  }
}

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

  return (
    <article className={`post ${isNew ? 'enter' : ''}`}>
      <header className="post-h">
        <Link to={`/u/${post.authorId}`}><Avatar p={author} size={38} /></Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="trunc">
            <Link to={`/u/${post.authorId}`} className="who">{mine ? 'You' : displayName(author)}</Link>
            <span className="muted"> {action(post, mine)}</span>
          </div>
          <div className="meta">{relTime(created)}{post.visibility === 'private' ? ' · 🔒 Only you' : ''}</div>
        </div>
        {mine && (
          <button className="icon-btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Post options"><Icon name="more" /></button>
        )}
      </header>
      {mine && menu && (
        <div className="row wrap" style={{ padding: '10px 14px 0' }}>
          <button className="btn sm" onClick={() => { setEditing(true); setMenu(false); }}>Edit text</button>
          {post.photos.length > 0 && (
            <ActionButton size="sm" state={prog.state} onClick={() => prog.run()} doneLabel="Saved">
              {post.progress ? 'Remove from progress' : 'Mark as progress photo'}
            </ActionButton>
          )}
          <ActionButton size="sm" state={vis.state} onClick={() => vis.run()} doneLabel="Saved">
            {post.visibility === 'friends' ? 'Make private' : 'Share with friends'}
          </ActionButton>
          <ActionButton size="sm" variant="danger" state={del.state} onClick={() => confirm('Delete this post?') && del.run()} pendingLabel="Deleting…">
            Delete
          </ActionButton>
        </div>
      )}
      <div className="post-b">
        {editing ? (
          <div className="col">
            <EmojiField multiline value={text} onChange={setText} maxLength={1000} autoFocus />
            <div className="row">
              <ActionButton size="sm" variant="primary" state={save.state} onClick={() => save.run()}>Save</ActionButton>
              <button className="btn sm ghost" onClick={() => { setEditing(false); setText(post.text); }}>Cancel</button>
            </div>
          </div>
        ) : post.text ? (
          <div className="post-text"><EmojiText text={post.text} /></div>
        ) : null}
        {post.kind === 'day' && post.day && <DayBlock d={post.day} />}
        {post.kind === 'activity' && post.activity && <ActivityBlock a={post.activity} />}
        {post.kind === 'recipe' && post.recipe && <RecipePostBlock post={post} authorName={displayName(author)} />}
        {post.weightKg != null && <WeightTag kg={post.weightKg} />}
        {post.photos.length > 0 && (
          <div className={`photos n${Math.min(post.photos.length, 4)}`}>
            {post.photos.slice(0, 4).map((ph) => (
              <img key={ph.path} src={ph.url} alt="" loading="lazy" width={ph.w} height={ph.h} onClick={() => setZoom(ph.url)} />
            ))}
          </div>
        )}
      </div>
      <Reactions postId={post.id} names={names} />
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </article>
  );
}

function WeightTag({ kg }: { kg: number }) {
  const { units } = useSession();
  return <div><span className="pill">⚖️ {fmtWeight(units, kg)}</span></div>;
}

function DayBlock({ d }: { d: NonNullable<Post['day']> }) {
  const pct = d.budget ? Math.round((d.kcal / d.budget) * 100) : 0;
  return (
    <div className="summary">
      <div className="row between">
        <span className="small muted">{fmtDay(d.date)}</span>
        {d.onTarget ? <span className="pill ok">✓ On target</span> : <span className="pill">{pct}% of target</span>}
      </div>
      <div className="summary-nums">
        <div><b>{fmtNum(d.kcal)}</b><span>of {fmtNum(d.budget)} kcal</span></div>
        {d.protein != null && <div><b style={{ color: 'var(--protein)' }}>{d.protein} g</b><span>protein</span></div>}
        {d.carbs != null && <div><b style={{ color: 'var(--carbs)' }}>{d.carbs} g</b><span>carbs</span></div>}
        {d.fat != null && <div><b style={{ color: 'var(--fat)' }}>{d.fat} g</b><span>fat</span></div>}
        {d.streak > 0 && <div><b>🔥 {d.streak}</b><span>day streak</span></div>}
      </div>
      <Meter value={d.kcal} max={Math.max(d.budget, d.kcal)} cls={d.onTarget ? 'ok' : d.kcal > d.budget ? 'over' : 'accent'} />
    </div>
  );
}

export function ActivityBlock({ a }: { a: NonNullable<Post['activity']> }) {
  const { units } = useSession();
  const t = ACTIVITY_TYPES[a.type];
  const pace = a.type === 'ride' ? fmtSpeed(units, a.distanceM, a.durationSec) : fmtPace(units, a.distanceM, a.durationSec);
  return (
    <div className="summary">
      <b>{t.glyph} {a.title || t.label}</b>
      <div className="summary-nums">
        {a.distanceM > 0 && <div><b>{fmtDist(units, a.distanceM)}</b><span>distance</span></div>}
        <div><b>{fmtDuration(a.durationSec)}</b><span>time</span></div>
        {a.distanceM > 0 && <div><b>{pace}</b><span>{a.type === 'ride' ? 'speed' : 'pace'}</span></div>}
        {a.elevationM > 0 && <div><b>{fmtElev(units, a.elevationM)}</b><span>elevation</span></div>}
        <div><b>{fmtNum(a.kcal)}</b><span>kcal</span></div>
      </div>
      {a.route?.length > 3 && <RouteTrace route={a.route} h={170} />}
      {a.exercises?.length > 0 && <ExerciseTable rows={a.exercises} />}
    </div>
  );
}

export function ExerciseTable({ rows }: { rows: StrengthSet[] }) {
  const { units } = useSession();
  return (
    <table className="kv">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.name}</td>
            <td className="n muted">{r.sets} × {r.reps}</td>
            <td className="n" style={{ width: 90 }}>{r.weightKg ? fmtWeight(units, r.weightKg) : 'Bodyweight'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
