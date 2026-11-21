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
      await navigator.share({ title: 'Get in shape together', text: `${displayName(profile)} invited you to train together`, url }).catch(() => undefined);
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
      <Panel title="INVITE A FRIEND" idx="01">
        <div className="col">
          <p className="small muted" style={{ margin: 0 }}>
            Create a link and send it to a friend. When they sign in with it you become friends — you'll see each other's posts and shared stats.
            Links work for anyone who has them for 14 days, so share them privately.
          </p>
          <ActionButton variant="accent" size="lg" block state={create.state} pendingLabel="GENERATING LINK" doneLabel="LINK READY" onClick={() => create.run()}>
            + CREATE INVITE LINK
          </ActionButton>
          {fresh && (
            <div className="row" style={{ border: '1px solid var(--accent)', padding: 6 }}>
              <code className="grow trunc small">{inviteUrl(fresh)}</code>
              <button className="btn sm" onClick={() => copy(fresh)}>COPY</button>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="FRIENDS" idx="02" tight right={<span className="muted">{friendIds.length}</span>}>
        {friendsLoading ? <div style={{ padding: 10 }}><Skeleton h={80} /></div> : friendIds.length === 0 ? (
          <div style={{ padding: 10 }}><Empty title="NO FRIENDS YET">Create an invite link above.</Empty></div>
        ) : (
          <>
            <div className="list-sep"><span>NAME / STATUS</span><span>STREAK · WORKOUTS</span></div>
            {sorted.map((id) => {
              const p = profiles.get(id);
              return (
                <Link key={id} to={`/u/${id}`} className="frow">
                  <Avatar p={p} size={40} />
                  <div className="col" style={{ gap: 0, minWidth: 0 }}>
                    <b className="trunc">{p ? displayName(p) : '…'}</b>
                    <span className="small muted trunc">{p?.status ? `> ${p.status}` : `active ${relTime(p?.lastActiveAt?.toDate?.()).toLowerCase()}`}</span>
                  </div>
                  <div className="right">
                    <b>{p?.stats?.streak ?? 0}d</b>
                    <div className="small muted">{p?.stats?.workouts ?? 0} wk</div>
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </Panel>

      {activeInvites.length > 0 && (
        <Panel title="OPEN INVITE LINKS" idx="03" tight>
          {activeInvites.map((i) => <InviteRow key={i.id} inv={i} onCopy={() => copy(i.id)} />)}
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
    <div className="frow" style={{ gridTemplateColumns: '1fr auto auto' }}>
      <div className="col" style={{ gap: 0, minWidth: 0 }}>
        <code className="small trunc">…/invite/{inv.id.slice(0, 8)}…</code>
        <span className="small muted">expires {fmtShort(inv.expiresAt.toDate())}</span>
      </div>
      <button className="btn sm" onClick={onCopy}>COPY</button>
      <ActionButton size="sm" variant="danger" state={del.state} onClick={() => del.run()} pendingLabel="…">REVOKE</ActionButton>
    </div>
  );
}

function ManageFriends({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel title="MANAGE" idx="04" tight right={<button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>{open ? 'HIDE' : 'SHOW'}</button>}>
      {open && ids.map((id) => <RemoveRow key={id} id={id} name={names.get(id) ?? id} />)}
      {!open && <div className="small muted" style={{ padding: '8px 12px' }}>Remove friends. They won't be notified.</div>}
    </Panel>
  );
}

function RemoveRow({ id, name }: { id: string; name: string }) {
  const { uid } = useMe();
  const toast = useToast();
  const rm = useAction(async () => { await removeFriend(uid, id); toast(`Removed ${name}`); });
  return (
    <div className="frow" style={{ gridTemplateColumns: '1fr auto' }}>
      <span className="trunc">{name}</span>
      <ActionButton size="sm" variant="danger" state={rm.state} pendingLabel="REMOVING" onClick={() => confirm(`Remove ${name} from friends?`) && rm.run()}>REMOVE</ActionButton>
    </div>
  );
}
