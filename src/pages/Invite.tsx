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
  }, { minPending: 600 });

  if (inv === undefined) return <div className="page"><Skeleton h={160} label="CHECKING INVITE" /></div>;
  if (inv === null) return <div className="page"><Empty title="INVITE NOT FOUND">This link is invalid or was revoked. Ask your friend for a new one. <Link to="/">Home →</Link></Empty></div>;

  const expired = inv.expiresAt.toMillis() < Date.now();
  const own = inv.createdBy === uid;
  const already = friendIds.includes(inv.createdBy);
  return (
    <div className="page">
      <Panel title="FRIEND INVITE">
        <div className="col gap2" style={{ alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
          <Avatar p={{ uid: inv.createdBy, photoURL: inv.inviterPhoto, avatarMode: inv.inviterPhoto ? 'photo' : 'generated', avatarSeed: inv.inviterSeed }} size={84} />
          <div>
            <h1 style={{ textTransform: 'none' }}>{inv.inviterName}</h1>
            <div className="muted small">wants to get in shape together</div>
          </div>
          <p className="small muted" style={{ maxWidth: 420 }}>
            Friends see each other's posts, reactions and streaks. Weight and food details stay private unless each of you chooses to share them.
          </p>
          {own ? <div className="small">This is your own invite link — send it to a friend.</div>
            : already ? <Link className="btn primary" to={`/u/${inv.createdBy}`}>ALREADY FRIENDS → VIEW PROFILE</Link>
              : expired ? <ErrorLine>This invite has expired. Ask for a new link.</ErrorLine>
                : (
                  <ActionButton variant="accent" size="lg" state={accept.state} pendingLabel="CONNECTING" doneLabel="CONNECTED" onClick={() => accept.run()}>
                    ACCEPT INVITE
                  </ActionButton>
                )}
          <ErrorLine>{accept.error}</ErrorLine>
        </div>
      </Panel>
    </div>
  );
}
