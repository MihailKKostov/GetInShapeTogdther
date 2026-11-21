import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, limit,
  orderBy, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where,
  writeBatch, type DocumentData,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as sref, uploadBytesResumable } from 'firebase/storage';
import type { User } from 'firebase/auth';
import { db, storage } from '../firebase';
import { randomId, randomSeed } from '../lib/avatar';
import { addDays, dateKey } from '../lib/dates';
import { resizeImage, type ResizedImage } from '../lib/images';
import { dayBudget, dayTotals, isOnTarget } from '../lib/nutrition';
import {
  DEFAULT_SHARING, EMPTY_STATS, type Activity, type CustomEmoji, type DiaryDay, type Food,
  type FoodEntry, type Invite, type Post, type PostPhoto, type PrivateSettings, type SharedValues,
  type Sharing, type UserProfile, type Visibility, type WeightEntry,
} from './types';

// ───────────────────────── refs
export const userRef = (uid: string) => doc(db, 'users', uid);
export const settingsRef = (uid: string) => doc(db, 'users', uid, 'private', 'settings');
export const recentsRef = (uid: string) => doc(db, 'users', uid, 'private', 'recents');
export const diaryRef = (uid: string, date: string) => doc(db, 'users', uid, 'diary', date);
export const diaryCol = (uid: string) => collection(db, 'users', uid, 'diary');
export const weightsCol = (uid: string) => collection(db, 'users', uid, 'weights');
export const activitiesCol = (uid: string) => collection(db, 'users', uid, 'activities');
export const foodsCol = (uid: string) => collection(db, 'users', uid, 'foods');
export const friendsCol = (uid: string) => collection(db, 'users', uid, 'friends');
export const postsCol = () => collection(db, 'posts');
export const reactionsCol = (postId: string) => collection(db, 'posts', postId, 'reactions');
export const emojisCol = () => collection(db, 'emojis');
export const invitesCol = () => collection(db, 'invites');

// ───────────────────────── profile
export async function ensureProfile(user: User): Promise<void> {
  const ref = userRef(user.uid);
  const snap = await getDoc(ref);
  const name = user.displayName || user.email?.split('@')[0] || 'Friend';
  if (!snap.exists()) {
    const profile: Omit<UserProfile, 'createdAt' | 'lastActiveAt'> & DocumentData = {
      uid: user.uid,
      displayName: name,
      nickname: '',
      photoURL: user.photoURL,
      avatarMode: user.photoURL ? 'photo' : 'generated',
      avatarSeed: randomSeed(),
      status: '',
      sharing: DEFAULT_SHARING,
      shared: {},
      stats: EMPTY_STATS,
    };
    await setDoc(ref, { ...profile, createdAt: serverTimestamp(), lastActiveAt: serverTimestamp() });
  } else {
    await updateDoc(ref, { lastActiveAt: serverTimestamp() }).catch(() => undefined);
  }
}

export function displayName(p: Pick<UserProfile, 'nickname' | 'displayName'> | null | undefined): string {
  if (!p) return '…';
  return (p.nickname || p.displayName || 'Friend').trim();
}

export async function updateProfile(uid: string, data: Partial<UserProfile>) {
  await updateDoc(userRef(uid), data as DocumentData);
}

export function computeShared(sharing: Sharing, s: PrivateSettings | null, latestKg: number | undefined): SharedValues {
  const out: SharedValues = {};
  if (!s) return out;
  if (sharing.currentWeight && latestKg != null) out.currentWeightKg = latestKg;
  if (sharing.targetWeight) out.targetWeightKg = s.targetWeightKg;
  if (sharing.startWeight) out.startWeightKg = s.startWeightKg;
  if (sharing.weightChange && latestKg != null) out.weightChangeKg = Math.round((latestKg - s.startWeightKg) * 10) / 10;
  if (sharing.height) out.heightCm = s.heightCm;
  if (sharing.calorieGoal) out.calorieGoal = s.calorieGoal;
  return out;
}

export async function latestWeight(uid: string): Promise<WeightEntry | undefined> {
  const snap = await getDocs(query(weightsCol(uid), orderBy('date', 'desc'), limit(1)));
  return snap.docs[0]?.data() as WeightEntry | undefined;
}

/** Recompute the public `shared` values from private data + sharing toggles. */
export async function syncShared(uid: string, sharing?: Sharing) {
  const [pSnap, sSnap, w] = await Promise.all([getDoc(userRef(uid)), getDoc(settingsRef(uid)), latestWeight(uid)]);
  const sh = sharing ?? ({ ...DEFAULT_SHARING, ...(pSnap.data()?.sharing ?? {}) } as Sharing);
  const shared = computeShared(sh, (sSnap.data() as PrivateSettings) ?? null, w?.kg);
  await updateDoc(userRef(uid), { sharing: sh, shared });
}

export async function setSharing(uid: string, sharing: Sharing) {
  await syncShared(uid, sharing);
}

export async function saveSettings(uid: string, s: PrivateSettings) {
  await setDoc(settingsRef(uid), s);
  await syncShared(uid);
}

// ───────────────────────── storage
export async function uploadImage(
  path: string, img: ResizedImage, onProgress?: (pct: number) => void,
): Promise<string> {
  const task = uploadBytesResumable(sref(storage, path), img.blob, {
    contentType: img.type,
    cacheControl: 'public, max-age=31536000',
  });
  await new Promise<void>((res, rej) => {
    task.on('state_changed', (s) => onProgress?.(s.totalBytes ? (s.bytesTransferred / s.totalBytes) * 100 : 0), rej, () => res());
  });
  return getDownloadURL(task.snapshot.ref);
}

export async function uploadAvatar(uid: string, img: ResizedImage, onProgress?: (p: number) => void) {
  const url = await uploadImage(`users/${uid}/avatar/${Date.now()}.jpg`, img, onProgress);
  await updateProfile(uid, { photoURL: url, avatarMode: 'photo' });
}

export async function uploadPostPhotos(uid: string, files: File[], onProgress?: (p: number) => void): Promise<PostPhoto[]> {
  const out: PostPhoto[] = [];
  const batchId = randomId(10);
  for (let i = 0; i < files.length; i++) {
    const img = await resizeImage(files[i], 1600);
    const path = `users/${uid}/posts/${batchId}_${i}.jpg`;
    const url = await uploadImage(path, img, (p) => onProgress?.((i * 100 + p) / files.length));
    out.push({ url, path, w: img.w, h: img.h });
  }
  onProgress?.(100);
  return out;
}

// ───────────────────────── weights
export async function logWeight(uid: string, date: string, kg: number) {
  await setDoc(doc(weightsCol(uid), date), { date, kg: Math.round(kg * 100) / 100, createdAt: serverTimestamp() });
  await syncShared(uid);
}

export async function deleteWeight(uid: string, date: string) {
  await deleteDoc(doc(weightsCol(uid), date));
  await syncShared(uid);
}

// ───────────────────────── diary
export async function addFoodEntry(uid: string, date: string, entry: FoodEntry, food: Food) {
  await setDoc(diaryRef(uid, date), { date, entries: arrayUnion(entry) }, { merge: true });
  // Recent foods list (most recent first, unique, capped).
  const rref = recentsRef(uid);
  const snap = await getDoc(rref);
  const items = ((snap.data()?.items ?? []) as Food[]).filter((f) => f.id !== food.id);
  await setDoc(rref, { items: [food, ...items].slice(0, 40) });
}

export async function removeFoodEntry(uid: string, date: string, entry: FoodEntry) {
  await updateDoc(diaryRef(uid, date), { entries: arrayRemove(entry) });
}

export async function replaceFoodEntry(uid: string, date: string, entry: FoodEntry) {
  await runTransaction(db, async (tx) => {
    const ref = diaryRef(uid, date);
    const snap = await tx.get(ref);
    const entries = ((snap.data()?.entries ?? []) as FoodEntry[]).map((e) => (e.id === entry.id ? entry : e));
    tx.set(ref, { date, entries }, { merge: true });
  });
}

export async function copyMeal(uid: string, from: string, to: string, meal: FoodEntry['meal']) {
  const snap = await getDoc(diaryRef(uid, from));
  const src = ((snap.data()?.entries ?? []) as FoodEntry[]).filter((e) => e.meal === meal);
  if (!src.length) throw new Error(`Nothing logged for ${meal} on ${from}`);
  const copies = src.map((e) => ({ ...e, id: randomId(12), addedAt: Date.now() }));
  await setDoc(diaryRef(uid, to), { date: to, entries: arrayUnion(...copies) }, { merge: true });
  return copies.length;
}

export async function setWater(uid: string, date: string, ml: number) {
  await setDoc(diaryRef(uid, date), { date, waterMl: Math.max(0, ml) }, { merge: true });
}

export async function saveCustomFood(uid: string, food: Food) {
  await setDoc(doc(foodsCol(uid), food.id), food);
}

export async function deleteCustomFood(uid: string, id: string) {
  await deleteDoc(doc(foodsCol(uid), id));
}

/** Recompute streak + days-on-target from closed diary days. */
export async function recomputeDayStats(uid: string) {
  const snap = await getDocs(query(diaryCol(uid), where('closed', '==', true)));
  const on = new Set(snap.docs.filter((d) => d.data().onTarget).map((d) => d.id));
  const closed = snap.docs.map((d) => d.id).sort();
  const sorted = [...on].sort();
  let best = 0, run = 0, prev = '';
  for (const k of sorted) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  const today = dateKey();
  let cursor = on.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (on.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  await updateDoc(userRef(uid), {
    'stats.streak': streak,
    'stats.bestStreak': best,
    'stats.daysOnTarget': on.size,
    'stats.lastClosedDay': closed[closed.length - 1] ?? null,
  });
  return { streak, best, daysOnTarget: on.size };
}

export async function closeDay(
  uid: string, date: string, settings: PrivateSettings, day: DiaryDay | null,
  opts: { share: boolean; note: string },
) {
  const totals = dayTotals(day ?? undefined);
  const budget = dayBudget(settings, day ?? undefined);
  const onTarget = isOnTarget(settings, totals.kcal, budget);
  await setDoc(diaryRef(uid, date), {
    date, closed: true, onTarget, budget, totals, closedAt: serverTimestamp(),
  }, { merge: true });
  const { streak } = await recomputeDayStats(uid);
  if (opts.share) {
    await createPost(uid, {
      kind: 'day',
      text: opts.note,
      visibility: 'friends',
      day: {
        date, kcal: Math.round(totals.kcal), budget, onTarget, streak,
        protein: Math.round(totals.protein), carbs: Math.round(totals.carbs), fat: Math.round(totals.fat),
      },
    });
  }
  return { onTarget, streak };
}

export async function reopenDay(uid: string, date: string) {
  await updateDoc(diaryRef(uid, date), { closed: false, onTarget: false });
  await recomputeDayStats(uid);
}

// ───────────────────────── activities
export type NewActivity = Omit<Activity, 'id' | 'createdAt' | 'postId' | 'startedAt'> & { startedAt: Date };

export async function createActivity(uid: string, a: NewActivity, opts: { share: boolean; photos: PostPhoto[] }) {
  const ref = doc(activitiesCol(uid));
  const date = dateKey(a.startedAt);
  const data = { ...a, date, startedAt: Timestamp.fromDate(a.startedAt), createdAt: serverTimestamp() };
  const batch = writeBatch(db);
  batch.set(ref, data);
  batch.update(userRef(uid), {
    'stats.workouts': increment(1),
    'stats.distanceM': increment(Math.round(a.distanceM)),
    'stats.activeSec': increment(Math.round(a.durationSec)),
  });
  batch.set(diaryRef(uid, date), { date, exerciseKcal: increment(Math.round(a.kcal)) }, { merge: true });
  await batch.commit();
  if (opts.share && a.visibility === 'friends') {
    const postId = await createPost(uid, {
      kind: 'activity',
      text: a.notes,
      visibility: 'friends',
      photos: opts.photos,
      activity: {
        id: ref.id, type: a.type, title: a.title, durationSec: a.durationSec, distanceM: a.distanceM,
        elevationM: a.elevationM, kcal: a.kcal, route: a.route, exercises: a.exercises,
      },
    });
    await updateDoc(ref, { postId });
  }
  return ref.id;
}

export async function deleteActivity(uid: string, a: Activity) {
  const batch = writeBatch(db);
  batch.delete(doc(activitiesCol(uid), a.id));
  batch.update(userRef(uid), {
    'stats.workouts': increment(-1),
    'stats.distanceM': increment(-Math.round(a.distanceM)),
    'stats.activeSec': increment(-Math.round(a.durationSec)),
  });
  batch.set(diaryRef(uid, a.date), { date: a.date, exerciseKcal: increment(-Math.round(a.kcal)) }, { merge: true });
  await batch.commit();
  if (a.postId) {
    const p = await getDoc(doc(postsCol(), a.postId));
    if (p.exists()) await deletePost({ id: p.id, ...p.data() } as Post);
  }
}

export async function updateActivityMeta(uid: string, id: string, data: { title: string; notes: string; visibility: Visibility }) {
  await updateDoc(doc(activitiesCol(uid), id), data);
}

// ───────────────────────── posts
export interface NewPost {
  kind: Post['kind'];
  text: string;
  visibility: Visibility;
  photos?: PostPhoto[];
  progress?: boolean;
  weightKg?: number;
  activity?: Post['activity'];
  day?: Post['day'];
}

export async function createPost(uid: string, p: NewPost): Promise<string> {
  const ref = doc(postsCol());
  await setDoc(ref, {
    authorId: uid,
    kind: p.kind,
    text: p.text.slice(0, 1000),
    visibility: p.visibility,
    photos: p.photos ?? [],
    progress: p.progress ?? false,
    weightKg: p.weightKg,
    activity: p.activity,
    day: p.day,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePost(id: string, data: { text?: string; visibility?: Visibility; progress?: boolean }) {
  await updateDoc(doc(postsCol(), id), data);
}

export async function deletePost(p: Post) {
  const reactions = await getDocs(reactionsCol(p.id));
  const batch = writeBatch(db);
  reactions.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  await deleteDoc(doc(postsCol(), p.id));
  // Photos are only deleted when they aren't shared with an activity's other post.
  await Promise.all((p.photos ?? []).map((ph) => deleteObject(sref(storage, ph.path)).catch(() => undefined)));
}

export async function toggleReaction(postId: string, uid: string, emoji: string, on: boolean) {
  await setDoc(doc(reactionsCol(postId), uid), {
    uid,
    emojis: on ? arrayUnion(emoji) : arrayRemove(emoji),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ───────────────────────── friends & invites
export async function createInvite(me: UserProfile): Promise<string> {
  const id = randomId(22);
  const data: DocumentData = {
    createdBy: me.uid,
    inviterName: displayName(me),
    inviterPhoto: me.avatarMode === 'photo' ? me.photoURL : null,
    inviterSeed: me.avatarSeed,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 14 * 86400000),
  };
  await setDoc(doc(invitesCol(), id), data);
  return id;
}

export async function getInvite(id: string): Promise<Invite | null> {
  const snap = await getDoc(doc(invitesCol(), id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Invite) : null;
}

export async function acceptInvite(meUid: string, invite: Invite) {
  if (invite.createdBy === meUid) throw new Error('This is your own invite link');
  if (invite.expiresAt.toMillis() < Date.now()) throw new Error('This invite has expired');
  const batch = writeBatch(db);
  const link = (uid: string) => ({ uid, inviteId: invite.id, since: serverTimestamp() });
  batch.set(doc(friendsCol(meUid), invite.createdBy), link(invite.createdBy));
  batch.set(doc(friendsCol(invite.createdBy), meUid), link(meUid));
  await batch.commit();
}

export async function removeFriend(meUid: string, friendUid: string) {
  const batch = writeBatch(db);
  batch.delete(doc(friendsCol(meUid), friendUid));
  batch.delete(doc(friendsCol(friendUid), meUid));
  await batch.commit();
}

export async function revokeInvite(id: string) {
  await deleteDoc(doc(invitesCol(), id));
}

// ───────────────────────── custom emojis
export async function createEmoji(uid: string, name: string, img: ResizedImage, onProgress?: (p: number) => void) {
  const existing = await getDoc(doc(emojisCol(), name));
  if (existing.exists()) throw new Error(`:${name}: already exists`);
  const path = `emojis/${uid}/${name}_${Date.now()}.png`;
  const url = await uploadImage(path, img, onProgress);
  const data: DocumentData = { name, url, path, createdBy: uid, createdAt: serverTimestamp() } satisfies Omit<CustomEmoji, 'createdAt'> & DocumentData;
  await setDoc(doc(emojisCol(), name), data);
}

export async function deleteEmoji(e: CustomEmoji) {
  await deleteDoc(doc(emojisCol(), e.name));
  await deleteObject(sref(storage, e.path)).catch(() => undefined);
}
