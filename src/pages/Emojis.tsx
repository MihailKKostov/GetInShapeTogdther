import { useEffect, useRef, useState } from 'react';
import { createEmoji, deleteEmoji } from '../data/api';
import type { CustomEmoji } from '../data/types';
import { ActionButton, Empty, ErrorLine, Panel, Seg, UploadProgress, useToast } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useObjectUrls } from '../hooks/useObjectUrls';
import { useMe } from '../hooks/useSession';
import { useProfiles } from '../hooks/useSocial';
import { squareImage, textEmoji, type ResizedImage } from '../lib/images';

const NAME_RE = /^[a-z0-9_-]{2,32}$/;
const SWATCHES = ['#f26b3a', '#1f2937', '#ffffff', '#16a34a', '#2563eb', '#dc2626', '#facc15', 'transparent'];

export default function Emojis() {
  const { emojis, uid } = useMe();
  const list = [...emojis.values()].sort((a, b) => a.name.localeCompare(b.name));
  const { names } = useProfiles([...new Set(list.map((e) => e.createdBy))]);
  return (
    <div className="page">
      <Creator />
      <Panel title={`Custom emojis${list.length ? ` (${list.length})` : ''}`}>
        {list.length === 0 ? <Empty icon="✨" title="No custom emojis yet">Create the first one above. Everyone can use them for reactions.</Empty> : (
          <div className="tiles">
            {list.map((e) => <EmojiTile key={e.name} e={e} mine={e.createdBy === uid} by={e.createdBy === uid ? 'you' : names.get(e.createdBy) ?? 'someone'} />)}
          </div>
        )}
      </Panel>
    </div>
  );
}

function EmojiTile({ e, mine, by }: { e: CustomEmoji; mine: boolean; by: string }) {
  const toast = useToast();
  const del = useAction(async () => { await deleteEmoji(e); toast(`:${e.name}: deleted`); });
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <img src={e.url} alt={e.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
      <code className="small trunc" style={{ maxWidth: '100%' }}>:{e.name}:</code>
      <span className="small muted trunc" style={{ maxWidth: '100%' }}>by {by}</span>
      {mine && <ActionButton size="sm" variant="danger" state={del.state} pendingLabel="Deleting…" onClick={() => confirm(`Delete :${e.name}:?`) && del.run()}>Delete</ActionButton>}
    </div>
  );
}

function Creator() {
  const { uid, emojis } = useMe();
  const toast = useToast();
  const [mode, setMode] = useState<'upload' | 'text'>('upload');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('PR');
  const [bg, setBg] = useState('#f26b3a');
  const [fg, setFg] = useState('#ffffff');
  const [img, setImg] = useState<ResizedImage | null>(null);
  const [pct, setPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview] = useObjectUrls([img?.blob]);

  // regenerate the preview whenever the inputs change
  useEffect(() => {
    let cancel = false;
    const go = async () => {
      if (mode === 'upload') {
        if (!file) { setImg(null); return; }
        const r = await squareImage(file, 128, 'image/png');
        if (!cancel) setImg(r);
      } else {
        if (!text.trim()) { setImg(null); return; }
        const r = await textEmoji(text, bg, fg, 128);
        if (!cancel) setImg(r);
      }
    };
    go().catch(() => setImg(null));
    return () => { cancel = true; };
  }, [mode, file, text, bg, fg]);

  const clean = name.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const taken = emojis.has(clean);
  const create = useAction(async () => {
    if (!NAME_RE.test(clean)) throw new Error('Name: 2–32 chars, a–z 0–9 _ -');
    if (taken) throw new Error(`:${clean}: already exists`);
    if (!img) throw new Error(mode === 'upload' ? 'Pick an image' : 'Enter text');
    setPct(0);
    await createEmoji(uid, clean, img, setPct);
    toast(<>Created <b>:{clean}:</b></>);
    setName(''); setFile(null);
  });

  return (
    <Panel title="Create an emoji">
      <div className="col gap2">
        <Seg value={mode} onChange={setMode} options={[{ v: 'upload', l: 'Upload image' }, { v: 'text', l: 'Text sticker' }]} block />
        <div className="row gap2 top">
          <div style={{ width: 96, height: 96, borderRadius: 12, background: 'var(--soft)', border: '1px dashed var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            {preview ? <img src={preview} alt="preview" style={{ width: 64, height: 64 }} /> : <span className="small faint">Preview</span>}
          </div>
          <div className="col grow">
            {mode === 'upload' ? (
              <>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; if (!name && e.target.files?.[0]) setName(e.target.files[0].name.replace(/\.[^.]+$/, '')); }} />
                <button className="btn" onClick={() => fileRef.current?.click()}>{file ? 'Change image' : 'Choose image'}</button>
                <span className="small muted">Cropped to a square. Transparent PNGs look best.</span>
              </>
            ) : (
              <>
                <label className="f"><span>Text</span><input value={text} maxLength={12} onChange={(e) => setText(e.target.value)} /></label>
                <div className="row wrap" style={{ gap: 4 }}>
                  <span className="flabel" style={{ width: 80 }}>Background</span>
                  {SWATCHES.map((c) => <Swatch key={`b${c}`} c={c} on={bg === c} onClick={() => setBg(c)} />)}
                </div>
                <div className="row wrap" style={{ gap: 4 }}>
                  <span className="flabel" style={{ width: 80 }}>Text color</span>
                  {SWATCHES.filter((c) => c !== 'transparent').map((c) => <Swatch key={`f${c}`} c={c} on={fg === c} onClick={() => setFg(c)} />)}
                </div>
              </>
            )}
          </div>
        </div>
        <label className="f">
          <span>Name {clean && <>· <code>:{clean}:</code></>} {taken && <span className="bad">already taken</span>}</span>
          <input value={name} maxLength={32} placeholder="e.g. legday" onChange={(e) => setName(e.target.value)} />
        </label>
        {create.state === 'pending' && <UploadProgress pct={pct} />}
        <ErrorLine>{create.error}</ErrorLine>
        <ActionButton variant="primary" block state={create.state} pendingLabel="Uploading…" doneLabel="Created" onClick={() => create.run()} disabled={!img || !clean || taken}>
          Create emoji
        </ActionButton>
      </div>
    </Panel>
  );
}

function Swatch({ c, on, onClick }: { c: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={c}
      style={{
        width: 26, height: 26, padding: 0, cursor: 'pointer', borderRadius: '50%',
        border: on ? '3px solid var(--primary)' : '1px solid var(--line)',
        background: c === 'transparent' ? 'repeating-conic-gradient(var(--faint) 0 25%, transparent 0 50%) 0 0 / 8px 8px' : c,
      }}
    />
  );
}
