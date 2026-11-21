import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPost, latestWeight, uploadPostPhotos } from '../data/api';
import type { Visibility } from '../data/types';
import { PostCard } from '../components/PostCard';
import {
  ActionButton, Empty, ErrorLine, Seg, Skeleton, Toggle, UploadProgress, useToast,
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
            { v: 'all', l: 'ALL' },
            { v: 'friends', l: `FRIENDS·${friendIds.length}` },
            { v: 'me', l: 'ME' },
            { v: 'progress', l: 'PROGRESS' },
          ]}
        />
        <span className="small muted">{feed.refreshing ? 'SYNCING…' : `${feed.posts.length} POSTS`}</span>
      </div>

      {(friendsLoading || feed.loading) && (
        <div className="col">
          <Skeleton h={120} label="LOADING FEED" />
          <Skeleton h={90} label="LOADING FEED" />
        </div>
      )}

      {!friendsLoading && !feed.loading && friendIds.length === 0 && filter !== 'me' && (
        <Empty title="NO FRIENDS YET">
          <p>The feed shows you and the people you add. <Link to="/friends">Create an invite link →</Link></p>
        </Empty>
      )}

      {!feed.loading && feed.posts.length === 0 && (filter === 'me' || friendIds.length > 0) && (
        <Empty title="NOTHING HERE YET">
          <p>Log a workout, close a day in your food log, or post a progress photo.</p>
        </Empty>
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
          {feed.refreshing ? 'LOADING…' : '↓ LOAD OLDER'}
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
        <div className="panel-h"><span className="t">NEW POST</span></div>
        <div className="row" style={{ padding: 8, gap: 8 }}>
          <button className="btn grow" onClick={() => start(false)}>+ STATUS</button>
          <button className="btn grow" onClick={() => start(true)}>+ PHOTO</button>
          <button className="btn accent grow" onClick={() => start(true, true)}>+ PROGRESS</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-h">
        <span className="t">NEW POST</span><span className="sp" />
        <button className="btn ghost sm" onClick={() => setOpen(false)}>✕</button>
      </div>
      <div className="panel-b col">
        <textarea
          autoFocus
          placeholder={progress ? 'How are you feeling about your progress?' : 'Short update…'}
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
                <span className="cap"><span>#{i + 1}</span><span>✕ REMOVE</span></span>
              </button>
            ))}
          </div>
        )}
        <div className="row wrap">
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={files.length >= 4}>
            + PHOTO {files.length}/4
          </button>
          {files.length > 0 && <Toggle on={progress} onChange={setProgress} label="PROGRESS PHOTO" />}
          {files.length > 0 && progress && <Toggle on={attachWeight} onChange={setAttachWeight} label="ATTACH WEIGHT" />}
        </div>
        <div className="row between wrap">
          <Seg<Visibility> value={vis} onChange={setVis} options={[{ v: 'friends', l: '◉ FRIENDS' }, { v: 'private', l: '○ ONLY ME' }]} />
          <ActionButton variant="primary" state={post.state} onClick={() => post.run()} pendingLabel={files.length ? 'UPLOADING' : 'POSTING'} doneLabel="POSTED">
            POST →
          </ActionButton>
        </div>
        {post.state === 'pending' && files.length > 0 && <UploadProgress pct={pct} />}
        <ErrorLine>{post.error}</ErrorLine>
        {progress && <p className="small muted">Progress photos collect on your profile timeline so you can compare before/after. Photos are resized and stripped of location data before upload.</p>}
      </div>
    </div>
  );
}
