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
const SWATCHES = ['#ff4f00', '#111110', '#f2f1ec', '#0f8a3c', '#2754ff', '#d41b1b', '#ffd400', 'transparent'];

export default function Emojis() {
  const { emojis, uid } = useMe();
  const list = [...emojis.values()].sort((a, b) => a.name.localeCompare(b.name));
  const { names } = useProfiles([...new Set(list.map((e) => e.createdBy))]);
  return (
    <div className="page">
      <Creator />
      <Panel title="CUSTOM EMOJIS" idx="02" right={<span className="muted">{list.length}</span>}>
        {list.length === 0 ? <Empty title="NONE YET">Create the first one above. Everyone in the app can react with custom emojis.</Empty> : (
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
    <div style={{ background: 'var(--paper)', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <img src={e.url} alt={e.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
      <code className="small trunc" style={{ maxWidth: '100%' }}>:{e.name}:</code>
      <span className="small muted trunc" style={{ maxWidth: '100%' }}>by {by}</span>
      {mine && <ActionButton size="sm" variant="danger" state={del.state} pendingLabel="…" onClick={() => confirm(`Delete :${e.name}:?`) && del.run()}>DELETE</ActionButton>}
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
  const [bg, setBg] = useState('#ff4f00');
  const [fg, setFg] = useState('#111110');
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
    <Panel title="CREATE EMOJI" idx="01">
      <div className="col gap2">
        <Seg value={mode} onChange={setMode} options={[{ v: 'upload', l: 'UPLOAD IMAGE' }, { v: 'text', l: 'TEXT STICKER' }]} block />
        <div className="row gap2 top">
          <div style={{ width: 96, height: 96, border: '1px dashed var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', backgroundImage: 'repeating-conic-gradient(var(--grid) 0 25%, transparent 0 50%)', backgroundSize: '12px 12px' }}>
            {preview ? <img src={preview} alt="preview" style={{ width: 64, height: 64 }} /> : <span className="small faint">PREVIEW</span>}
          </div>
          <div className="col grow">
            {mode === 'upload' ? (
              <>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; if (!name && e.target.files?.[0]) setName(e.target.files[0].name.replace(/\.[^.]+$/, '')); }} />
                <button className="btn" onClick={() => fileRef.current?.click()}>{file ? 'CHANGE IMAGE' : 'CHOOSE IMAGE'}</button>
                <span className="small muted">Center-cropped to a square, 128×128 PNG. Transparent PNGs look best.</span>
              </>
            ) : (
              <>
                <label className="f"><span>Text · use \n for a new line</span><input value={text} maxLength={12} onChange={(e) => setText(e.target.value)} /></label>
                <div className="row wrap" style={{ gap: 4 }}>
                  <span className="flabel" style={{ width: 24 }}>BG</span>
                  {SWATCHES.map((c) => <Swatch key={`b${c}`} c={c} on={bg === c} onClick={() => setBg(c)} />)}
                </div>
                <div className="row wrap" style={{ gap: 4 }}>
                  <span className="flabel" style={{ width: 24 }}>FG</span>
                  {SWATCHES.filter((c) => c !== 'transparent').map((c) => <Swatch key={`f${c}`} c={c} on={fg === c} onClick={() => setFg(c)} />)}
                </div>
              </>
            )}
          </div>
        </div>
        <label className="f">
          <span>Name {clean && <>→ <code>:{clean}:</code></>} {taken && <span className="bad">taken</span>}</span>
          <input value={name} maxLength={32} placeholder="e.g. legday" onChange={(e) => setName(e.target.value)} />
        </label>
        {create.state === 'pending' && <UploadProgress pct={pct} />}
        <ErrorLine>{create.error}</ErrorLine>
        <ActionButton variant="primary" block state={create.state} pendingLabel="UPLOADING" doneLabel="CREATED" onClick={() => create.run()} disabled={!img || !clean || taken}>
          CREATE :{clean || 'name'}:
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
        width: 24, height: 24, padding: 0, cursor: 'pointer',
        border: on ? '2px solid var(--accent)' : '1px solid var(--line)',
        background: c === 'transparent' ? 'repeating-conic-gradient(var(--faint) 0 25%, transparent 0 50%) 0 0 / 8px 8px' : c,
      }}
    />
  );
}
