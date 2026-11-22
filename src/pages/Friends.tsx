import { useState } from 'react';
import { Link } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { createInvite, displayName, invitesCol, removeFriend, revokeInvite } from '../data/api';
import type { Invite } from '../data/types';
import { ActionButton, Avatar, Empty, Panel, Skeleton, useToast } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useQuery } from '../hooks/useFirestore';
import { useMe } from '../hooks/useSession';
import { useProfiles } from '../hooks/useSocial';
import { EmojiText } from '../components/EmojiText';
import { fmtShort, relTime } from '../lib/dates';

export function inviteUrl(id: string) {
  return `${location.origin}/invite/${id}`;
}

export default function Friends() {
  const { uid, profile, friendIds, friendsLoading } = useMe();
  const toast = useToast();
  const { profiles } = useProfiles(friendIds);
  const invites = useQuery<Invite>(query(invitesCol(), where('createdBy', '==', uid)), `inv:${uid}`);
  const [fresh, setFresh] = useState<string | null>(null);

  const create = useAction(async () => {
    const id = await createInvite(profile);
    setFresh(id);
    const url = inviteUrl(id);
    if (navigator.share) {
      await navigator.share({ title: 'Join me on WeFit', text: `${displayName(profile)} invited you to get fit together on WeFit`, url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      toast('Invite link copied to clipboard');
    }
  });

  const copy = async (id: string) => {
    await navigator.clipboard?.writeText(inviteUrl(id));
    toast('Link copied');
  };

  const sorted = [...friendIds].sort((a, b) => (profiles.get(b)?.stats?.streak ?? 0) - (profiles.get(a)?.stats?.streak ?? 0));
  const activeInvites = invites.data.filter((i) => i.expiresAt.toMillis() > Date.now());

  return (
    <div className="page">
      <Panel title="Invite friends">
        <div className="col">
          <p className="small muted" style={{ margin: 0 }}>
            Send a link to a friend. When they sign up with it, you'll see each other's updates. Links expire after 14 days.
          </p>
          <ActionButton variant="primary" size="lg" block state={create.state} pendingLabel="Creating link…" doneLabel="Link ready" onClick={() => create.run()}>
            Create invite link
          </ActionButton>
          {fresh && (
            <div className="row" style={{ background: 'var(--primary-soft)', borderRadius: 8, padding: '6px 6px 6px 12px' }}>
              <code className="grow trunc small invite-link">{inviteUrl(fresh)}</code>
              <button className="btn sm" onClick={() => copy(fresh)}>Copy</button>
            </div>
          )}
        </div>
      </Panel>

      <Panel title={`Friends${friendIds.length ? ` (${friendIds.length})` : ''}`} tight>
        {friendsLoading ? <div style={{ padding: 16 }}><Skeleton h={80} /></div> : friendIds.length === 0 ? (
          <Empty icon="👋" title="No friends yet">Create an invite link above and send it to someone.</Empty>
        ) : (
          <div className="list">
            {sorted.map((id) => {
              const p = profiles.get(id);
              return (
                <Link key={id} to={`/u/${id}`} className="li">
                  <Avatar p={p} size={44} />
                  <div className="main">
                    <div className="name">{p ? displayName(p) : '…'}</div>
                    <div className="sub">{p?.status ? <EmojiText text={p.status} /> : `Active ${relTime(p?.lastActiveAt?.toDate?.())}`}</div>
                  </div>
                  <div className="end">
                    <b>🔥 {p?.stats?.streak ?? 0}</b>
                    <div className="small muted">{p?.stats?.workouts ?? 0} workouts</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>

      {activeInvites.length > 0 && (
        <Panel title="Open invite links" tight>
          <div className="list">{activeInvites.map((i) => <InviteRow key={i.id} inv={i} onCopy={() => copy(i.id)} />)}</div>
        </Panel>
      )}

      {friendIds.length > 0 && <ManageFriends ids={sorted} names={new Map(sorted.map((id) => [id, profiles.get(id) ? displayName(profiles.get(id)) : id]))} />}
    </div>
  );
}

function InviteRow({ inv, onCopy }: { inv: Invite; onCopy: () => void }) {
  const toast = useToast();
  const del = useAction(async () => { await revokeInvite(inv.id); toast('Invite revoked'); });
  return (
    <div className="li">
      <div className="main">
        <div className="name small">…/invite/{inv.id.slice(0, 8)}…</div>
        <div className="sub">Expires {fmtShort(inv.expiresAt.toDate())}</div>
      </div>
      <button className="btn sm" onClick={onCopy}>Copy</button>
      <ActionButton size="sm" variant="danger" state={del.state} onClick={() => del.run()} pendingLabel="Revoking…">Revoke</ActionButton>
    </div>
  );
}

function ManageFriends({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel title="Manage friends" tight right={<button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</button>}>
      {open ? <div className="list">{ids.map((id) => <RemoveRow key={id} id={id} name={names.get(id) ?? id} />)}</div>
        : <div className="small muted" style={{ padding: '4px 16px 10px' }}>Remove someone from your friends. They won't be notified.</div>}
    </Panel>
  );
}

function RemoveRow({ id, name }: { id: string; name: string }) {
  const { uid } = useMe();
  const toast = useToast();
  const rm = useAction(async () => { await removeFriend(uid, id); toast(`Removed ${name}`); });
  return (
    <div className="li">
      <span className="main trunc">{name}</span>
      <ActionButton size="sm" variant="danger" state={rm.state} pendingLabel="Removing…" onClick={() => confirm(`Remove ${name} from friends?`) && rm.run()}>Remove</ActionButton>
    </div>
  );
}
