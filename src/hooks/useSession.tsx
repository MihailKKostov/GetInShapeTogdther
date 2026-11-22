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

  // Start listening to the profile right away (served from the local cache on return visits);
  // creating a first-time profile / bumping "last active" happens in the background.
  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthLoading(false);
    if (u) ensureProfile(u).catch((e) => console.error('profile init failed', e));
  }), []);

  const uid = user ? user.uid : null;
  const profile = useDoc<UserProfile>(uid ? userRef(uid) : null, `p:${uid}`);
  const settings = useDoc<PrivateSettings>(uid ? settingsRef(uid) : null, `s:${uid}`);
  const friends = useQuery<FriendLink>(uid ? query(friendsCol(uid)) : null, `f:${uid}`);
  const emojis = useQuery<CustomEmoji>(uid ? query(emojisCol()) : null, `e:${uid}`);

  const value = useMemo<Session>(() => ({
    user,
    authLoading,
    profile: profile.data,
    settings: settings.data,
    settingsLoading: settings.loading,
    friendIds: friends.data.map((f) => f.uid),
    friendsLoading: friends.loading,
    emojis: new Map(emojis.data.map((e) => [e.name, e])),
    units: settings.data?.units ?? 'metric',
  }), [user, authLoading, profile.data, settings.data, settings.loading, friends.data, friends.loading, emojis.data]);

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
