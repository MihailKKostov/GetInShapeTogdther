import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { query } from 'firebase/firestore';
import { auth } from '../firebase';
import { emojisCol, ensureProfile, friendsCol, settingsRef, userRef } from '../data/api';
import type { CustomEmoji, FriendLink, PrivateSettings, Units, UserProfile } from '../data/types';
import { useDoc, useQuery } from './useFirestore';

interface Session {
  user: User | null;
  authLoading: boolean;
  profile: UserProfile | null;
  settings: PrivateSettings | null;
  settingsLoading: boolean;
  friendIds: string[];
  friendsLoading: boolean;
  emojis: Map<string, CustomEmoji>;
  units: Units;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u);
    setReady(false);
    if (u) {
      try { await ensureProfile(u); } catch (e) { console.error('profile init failed', e); }
      setReady(true);
    }
    setAuthLoading(false);
  }), []);

  const uid = user && ready ? user.uid : null;
  const profile = useDoc<UserProfile>(uid ? userRef(uid) : null, `p:${uid}`);
  const settings = useDoc<PrivateSettings>(uid ? settingsRef(uid) : null, `s:${uid}`);
  const friends = useQuery<FriendLink>(uid ? query(friendsCol(uid)) : null, `f:${uid}`);
  const emojis = useQuery<CustomEmoji>(uid ? query(emojisCol()) : null, `e:${uid}`);

  const value = useMemo<Session>(() => ({
    user,
    authLoading: authLoading || (!!user && !ready),
    profile: profile.data,
    settings: settings.data,
    settingsLoading: settings.loading || (!!user && !ready),
    friendIds: friends.data.map((f) => f.uid),
    friendsLoading: friends.loading,
    emojis: new Map(emojis.data.map((e) => [e.name, e])),
    units: settings.data?.units ?? 'metric',
  }), [user, authLoading, ready, profile.data, settings.data, settings.loading, friends.data, friends.loading, emojis.data]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside provider');
  return s;
}

/** For pages behind the auth gate, where user/profile/settings are guaranteed. */
export function useMe() {
  const s = useSession();
  return { ...s, uid: s.user!.uid, profile: s.profile!, settings: s.settings! };
}
