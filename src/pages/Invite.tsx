import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { acceptInvite, getInvite } from '../data/api';
import type { Invite as InviteT } from '../data/types';
import { ActionButton, Avatar, Empty, ErrorLine, Panel, Skeleton, useToast } from '../components/ui';
import { useAction } from '../hooks/useAction';
import { useMe } from '../hooks/useSession';

export default function Invite() {
  const { code = '' } = useParams();
  const { uid, friendIds } = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const [inv, setInv] = useState<InviteT | null | undefined>(undefined);

  useEffect(() => {
    try { sessionStorage.removeItem('gist.invite'); } catch { /* ignore */ }
    getInvite(code).then(setInv).catch(() => setInv(null));
  }, [code]);

  const accept = useAction(async () => {
    await acceptInvite(uid, inv!);
    toast(`You and ${inv!.inviterName} are now friends`);
    setTimeout(() => nav(`/u/${inv!.createdBy}`), 500);
  });

  if (inv === undefined) return <div className="page"><Skeleton h={220} /></div>;
  if (inv === null) return <div className="page"><div className="panel"><Empty icon="🤷" title="Invite not found">This link is invalid or was revoked. Ask your friend for a new one. <Link to="/">Go home</Link></Empty></div></div>;

  const expired = inv.expiresAt.toMillis() < Date.now();
  const own = inv.createdBy === uid;
  const already = friendIds.includes(inv.createdBy);
  return (
    <div className="page">
      <Panel>
        <div className="col gap2" style={{ alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
          <Avatar p={{ uid: inv.createdBy, photoURL: inv.inviterPhoto, avatarMode: inv.inviterPhoto ? 'photo' : 'generated', avatarSeed: inv.inviterSeed, displayName: inv.inviterName }} size={84} />
          <div>
            <h1>{inv.inviterName}</h1>
            <div className="muted">invited you to join WeFit</div>
          </div>
          <p className="small muted" style={{ maxWidth: 420 }}>
            Friends see each other's posts and streaks. Your weight and food stay private unless you choose to share them.
          </p>
          {own ? <div className="small">This is your own invite link — send it to a friend.</div>
            : already ? <Link className="btn primary" to={`/u/${inv.createdBy}`}>You're already friends — view profile</Link>
              : expired ? <ErrorLine>This invite has expired. Ask for a new link.</ErrorLine>
                : (
                  <ActionButton variant="primary" size="lg" state={accept.state} pendingLabel="Connecting…" doneLabel="You're friends!" onClick={() => accept.run()}>
                    Accept invite
                  </ActionButton>
                )}
          <ErrorLine>{accept.error}</ErrorLine>
        </div>
      </Panel>
    </div>
  );
}
