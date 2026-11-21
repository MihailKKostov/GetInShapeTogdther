import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPost, latestWeight, uploadPostPhotos } from '../data/api';
import type { Visibility } from '../data/types';
import { PostCard } from '../components/PostCard';
import {
  ActionButton, Empty, ErrorLine, Icon, Seg, Skeleton, Spinner, Toggle, UploadProgress, useToast,
} from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useObjectUrls } from '../hooks/useObjectUrls';
import { useMe } from '../hooks/useSession';
import { usePosts, useProfiles } from '../hooks/useSocial';

type Filter = 'all' | 'friends' | 'me' | 'progress';

export default function Feed() {
  const { uid, friendIds, friendsLoading } = useMe();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(15);
  const authors = useMemo(
    () => (filter === 'me' ? [uid] : filter === 'friends' ? friendIds : [uid, ...friendIds]),
    [filter, uid, friendIds],
  );
  const { profiles, names } = useProfiles([uid, ...friendIds]);
  const feed = usePosts(friendsLoading ? [] : authors, uid, page, filter === 'progress');
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!feed.loading && seen.current === null) seen.current = new Set(feed.posts.map((p) => p.id));
  }, [feed.loading, feed.posts]);

  return (
    <div className="page">
      <Composer />
      <div className="row between wrap">
        <Seg<Filter>
          value={filter}
          onChange={(f) => { setFilter(f); setPage(15); }}
          options={[
            { v: 'all', l: 'All' },
            { v: 'friends', l: 'Friends' },
            { v: 'me', l: 'Me' },
            { v: 'progress', l: 'Progress' },
          ]}
        />
        {feed.refreshing && !feed.loading && <span className="small muted row"><Spinner /> Updating</span>}
      </div>

      {(friendsLoading || feed.loading) && (
        <div className="col">
          <Skeleton h={140} />
          <Skeleton h={110} />
        </div>
      )}

      {!friendsLoading && !feed.loading && friendIds.length === 0 && filter !== 'me' && (
        <div className="panel"><Empty icon="👋" title="Invite your friends">
          <p>Your feed shows updates from you and your friends.</p>
          <Link className="btn primary" to="/friends">Invite friends</Link>
        </Empty></div>
      )}

      {!feed.loading && feed.posts.length === 0 && (filter === 'me' || friendIds.length > 0) && (
        <div className="panel"><Empty icon="🌱" title="Nothing here yet">
          <p style={{ margin: 0 }}>Log a workout, complete a day in your diary, or post a progress photo.</p>
        </Empty></div>
      )}

      {feed.posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          author={profiles.get(p.authorId)}
          names={names}
          isNew={seen.current !== null && !seen.current.has(p.id)}
        />
      ))}

      {feed.hasMore && (
        <button className="btn block" onClick={() => setPage((n) => n + 15)} disabled={feed.refreshing}>
          {feed.refreshing ? 'Loading…' : 'Load older posts'}
        </button>
      )}
    </div>
  );
}

function Composer() {
  const { uid } = useMe();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(false);
  const [attachWeight, setAttachWeight] = useState(false);
  const [vis, setVis] = useState<Visibility>('friends');
  const [pct, setPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = useObjectUrls([files[0], files[1], files[2], files[3]]).slice(0, files.length);

  const post = useAction(async () => {
    if (!text.trim() && !files.length) throw new Error('Write something or add a photo');
    setPct(0);
    const photos = files.length ? await uploadPostPhotos(uid, files, setPct) : [];
    const w = attachWeight ? await latestWeight(uid) : undefined;
    await createPost(uid, {
      kind: photos.length ? 'photo' : 'status',
      text: text.trim(),
      visibility: vis,
      photos,
      progress: photos.length > 0 && progress,
      weightKg: w?.kg,
    });
    setText(''); setFiles([]); setProgress(false); setAttachWeight(false); setOpen(false);
    toast(vis === 'friends' ? 'Posted to friends feed' : 'Saved privately');
  });

  const start = (withPhoto: boolean, prog = false) => {
    setOpen(true);
    setProgress(prog);
    if (withPhoto) setTimeout(() => fileRef.current?.click(), 0);
  };

  if (!open) {
    return (
      <div className="panel">
        <div className="col" style={{ padding: 12, gap: 10 }}>
          <button className="row" onClick={() => start(false)} style={{ border: 0, background: 'var(--hover)', borderRadius: 999, padding: '10px 16px', color: 'var(--muted)', cursor: 'text', textAlign: 'left' }}>
            Share an update…
          </button>
          <div className="row">
            <button className="btn ghost sm grow" onClick={() => start(true)}><Icon name="camera" size={18} /> Photo</button>
            <button className="btn soft sm grow" onClick={() => start(true, true)}>📈 Progress photo</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <span className="t">{progress ? 'Progress photo' : 'New post'}</span><span className="sp" />
        <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Cancel"><Icon name="close" size={20} /></button>
      </div>
      <div className="panel-b col">
        <textarea
          autoFocus
          placeholder={progress ? 'How are you feeling about your progress?' : "What's new?"}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).slice(0, 4);
            setFiles((f) => [...f, ...picked].slice(0, 4));
            e.target.value = '';
          }}
        />
        {files.length > 0 && (
          <div className="pgrid">
            {previews.map((u, i) => u && (
              <button key={u} type="button" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))} title="Remove">
                <img src={u} alt="" />
                <span className="cap"><span /><span>Remove ✕</span></span>
              </button>
            ))}
          </div>
        )}
        <div className="row wrap">
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={files.length >= 4}>
            <Icon name="camera" size={16} /> {files.length ? `Add photo (${files.length}/4)` : 'Add photo'}
          </button>
        </div>
        <div className="col" style={{ gap: 10 }}>
          {files.length > 0 && <Toggle on={progress} onChange={setProgress} label="Progress photo" />}
          {files.length > 0 && progress && <Toggle on={attachWeight} onChange={setAttachWeight} label="Include my current weight" />}
        </div>
        <div className="row between wrap">
          <Seg<Visibility> value={vis} onChange={setVis} options={[{ v: 'friends', l: '👥 Friends' }, { v: 'private', l: '🔒 Only me' }]} />
          <ActionButton variant="primary" state={post.state} onClick={() => post.run()} pendingLabel={files.length ? 'Uploading…' : 'Posting…'} doneLabel="Posted">
            Post
          </ActionButton>
        </div>
        {post.state === 'pending' && files.length > 0 && <UploadProgress pct={pct} />}
        <ErrorLine>{post.error}</ErrorLine>
        {progress && <p className="small muted" style={{ margin: 0 }}>Progress photos appear on your profile timeline, where you can compare before and after.</p>}
      </div>
    </div>
  );
}
