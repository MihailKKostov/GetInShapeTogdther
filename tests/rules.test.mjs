// Security rules tests. Run with: npm run test:rules (starts the emulators for you).
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
  writeBatch, arrayUnion, orderBy, deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let env;
const PID = 'demo-gist';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

const sharing = (over = {}) => ({
  currentWeight: false, targetWeight: false, startWeight: false, weightChange: false,
  weightHistory: false, height: false, calorieGoal: false, diary: false, activities: true, ...over,
});

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

async function seedUsers(sh = {}) {
  await seed(async (a) => {
    for (const uid of ['alice', 'bob', 'eve']) {
      await setDoc(doc(a, 'users', uid), { uid, displayName: uid, sharing: sharing(sh[uid]), shared: {}, stats: {} });
    }
    // alice <-> bob are friends
    await setDoc(doc(a, 'users/alice/friends/bob'), { uid: 'bob', inviteId: 'x' });
    await setDoc(doc(a, 'users/bob/friends/alice'), { uid: 'alice', inviteId: 'x' });
  });
}

describe('profiles', () => {
  test('owner creates own profile, not someone else\'s', async () => {
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice'), { uid: 'alice' }));
    await assertFails(setDoc(doc(db('alice'), 'users/bob'), { uid: 'bob' }));
  });
  test('friends can read, strangers cannot', async () => {
    await seedUsers();
    await assertSucceeds(getDoc(doc(db('bob'), 'users/alice')));
    await assertFails(getDoc(doc(db('eve'), 'users/alice')));
    await assertFails(getDoc(doc(db(null), 'users/alice')));
  });
  test('private settings are owner-only', async () => {
    await seedUsers();
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice/private/settings'), { heightCm: 170 }));
    await assertFails(getDoc(doc(db('bob'), 'users/alice/private/settings')));
  });
});

describe('friendships via invites', () => {
  test('accepting a valid invite creates both sides', async () => {
    await seedUsers();
    await seed((a) => setDoc(doc(a, 'invites/INVITE_CODE_123456'), {
      createdBy: 'alice', expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
    }));
    const eve = db('eve');
    const b = writeBatch(eve);
    b.set(doc(eve, 'users/eve/friends/alice'), { uid: 'alice', inviteId: 'INVITE_CODE_123456', since: serverTimestamp() });
    b.set(doc(eve, 'users/alice/friends/eve'), { uid: 'eve', inviteId: 'INVITE_CODE_123456', since: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
  test('cannot forge a friendship without an invite from the other person', async () => {
    await seedUsers();
    await seed((a) => setDoc(doc(a, 'invites/EVE_OWN_INVITE_12345'), {
      createdBy: 'eve', expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
    }));
    // eve uses her own invite to add herself to alice's list
    await assertFails(setDoc(doc(db('eve'), 'users/alice/friends/eve'), { uid: 'eve', inviteId: 'EVE_OWN_INVITE_12345' }));
    await assertFails(setDoc(doc(db('eve'), 'users/eve/friends/alice'), { uid: 'alice', inviteId: 'EVE_OWN_INVITE_12345' }));
    await assertFails(setDoc(doc(db('eve'), 'users/alice/friends/eve'), { uid: 'eve', inviteId: 'nope' }));
  });
  test('expired invites are rejected', async () => {
    await seedUsers();
    await seed((a) => setDoc(doc(a, 'invites/OLD_INVITE_CODE_1234'), {
      createdBy: 'alice', expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    }));
    await assertFails(setDoc(doc(db('eve'), 'users/eve/friends/alice'), { uid: 'alice', inviteId: 'OLD_INVITE_CODE_1234' }));
  });
  test('either side can unfriend; strangers cannot', async () => {
    await seedUsers();
    await assertFails(deleteDoc(doc(db('eve'), 'users/alice/friends/bob')));
    await assertSucceeds(deleteDoc(doc(db('bob'), 'users/alice/friends/bob')));
  });
  test('invites: anyone signed in can get by id, only creator can list', async () => {
    await seed((a) => setDoc(doc(a, 'invites/SOME_INVITE_CODE_123'), { createdBy: 'alice', expiresAt: Timestamp.fromMillis(Date.now() + 1e6) }));
    await assertSucceeds(getDoc(doc(db('eve'), 'invites/SOME_INVITE_CODE_123')));
    await assertFails(getDocs(collection(db('eve'), 'invites')));
    await assertSucceeds(getDocs(query(collection(db('alice'), 'invites'), where('createdBy', '==', 'alice'))));
  });
});

describe('posts & reactions', () => {
  beforeEach(async () => {
    await seedUsers();
    await seed(async (a) => {
      await setDoc(doc(a, 'posts/p1'), { authorId: 'alice', kind: 'status', visibility: 'friends', text: 'hi', createdAt: Timestamp.now() });
      await setDoc(doc(a, 'posts/p2'), { authorId: 'alice', kind: 'photo', visibility: 'private', text: '', createdAt: Timestamp.now() });
    });
  });
  test('friend feed query (author + visibility) is allowed', async () => {
    const q = query(collection(db('bob'), 'posts'), where('authorId', '==', 'alice'), where('visibility', '==', 'friends'), orderBy('createdAt', 'desc'));
    const snap = await assertSucceeds(getDocs(q));
    if (snap.size !== 1) throw new Error(`expected 1 post, got ${snap.size}`);
  });
  test('friend cannot read private posts; stranger cannot read any', async () => {
    await assertFails(getDoc(doc(db('bob'), 'posts/p2')));
    await assertFails(getDoc(doc(db('eve'), 'posts/p1')));
    await assertFails(getDocs(query(collection(db('eve'), 'posts'), where('authorId', '==', 'alice'), where('visibility', '==', 'friends'))));
    // own query including private posts
    await assertSucceeds(getDocs(query(collection(db('alice'), 'posts'), where('authorId', '==', 'alice'))));
  });
  test('cannot post as someone else', async () => {
    await assertFails(setDoc(doc(db('bob'), 'posts/x'), { authorId: 'alice', kind: 'status', visibility: 'friends', text: 'fake' }));
    await assertSucceeds(setDoc(doc(db('bob'), 'posts/x'), { authorId: 'bob', kind: 'status', visibility: 'friends', text: 'real' }));
  });
  test('friends react with their own doc only', async () => {
    await assertSucceeds(setDoc(doc(db('bob'), 'posts/p1/reactions/bob'), { uid: 'bob', emojis: arrayUnion('🔥'), updatedAt: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(db('bob'), 'posts/p1/reactions/bob'), { uid: 'bob', emojis: arrayUnion(':legday:'), updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db('bob'), 'posts/p1/reactions/alice'), { uid: 'alice', emojis: ['🔥'] }));
    await assertFails(setDoc(doc(db('eve'), 'posts/p1/reactions/eve'), { uid: 'eve', emojis: ['🔥'] }));
    await assertFails(setDoc(doc(db('bob'), 'posts/p2/reactions/bob'), { uid: 'bob', emojis: ['🔥'] }));
    await assertFails(setDoc(doc(db('bob'), 'posts/p1/reactions/bob'), { uid: 'bob', emojis: ['🔥'], comment: 'no comments allowed' }));
    await assertSucceeds(getDocs(collection(db('bob'), 'posts/p1/reactions')));
  });
  test('friend cannot edit someone else\'s post', async () => {
    await assertFails(updateDoc(doc(db('bob'), 'posts/p1'), { text: 'hacked' }));
  });
});

describe('shared vs private data', () => {
  test('weights hidden from friends unless weightHistory is shared', async () => {
    await seedUsers();
    await seed((a) => setDoc(doc(a, 'users/alice/weights/2026-11-20'), { date: '2026-11-20', kg: 80 }));
    await assertFails(getDocs(collection(db('bob'), 'users/alice/weights')));
    await seed((a) => updateDoc(doc(a, 'users/alice'), { 'sharing.weightHistory': true }));
    await assertSucceeds(getDocs(collection(db('bob'), 'users/alice/weights')));
    await assertFails(getDocs(collection(db('eve'), 'users/alice/weights')));
  });
  test('diary hidden unless shared', async () => {
    await seedUsers({ alice: { diary: false } });
    await assertFails(getDoc(doc(db('bob'), 'users/alice/diary/2026-11-20')));
    await seed((a) => updateDoc(doc(a, 'users/alice'), { 'sharing.diary': true }));
    await assertSucceeds(getDoc(doc(db('bob'), 'users/alice/diary/2026-11-20')));
  });
  test('friend activity query must filter by visibility', async () => {
    await seedUsers();
    await seed(async (a) => {
      await setDoc(doc(a, 'users/alice/activities/a1'), { visibility: 'friends', startedAt: Timestamp.now() });
      await setDoc(doc(a, 'users/alice/activities/a2'), { visibility: 'private', startedAt: Timestamp.now() });
    });
    await assertSucceeds(getDocs(query(collection(db('bob'), 'users/alice/activities'), where('visibility', '==', 'friends'))));
    await assertFails(getDocs(collection(db('bob'), 'users/alice/activities')));
    await seed((a) => updateDoc(doc(a, 'users/alice'), { 'sharing.activities': false }));
    await assertFails(getDocs(query(collection(db('bob'), 'users/alice/activities'), where('visibility', '==', 'friends'))));
  });
  test('custom foods are owner-only', async () => {
    await seedUsers();
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice/foods/f1'), { name: 'x' }));
    await assertFails(getDoc(doc(db('bob'), 'users/alice/foods/f1')));
  });
});

describe('recipe imports', () => {
  test('owner creates a pending request; nobody can forge a result', async () => {
    await seedUsers();
    const ok = { url: 'https://example.com/recipe', status: 'pending', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('alice'), 'users/alice/recipeImports/r1'), ok));
    await assertFails(setDoc(doc(db('alice'), 'users/alice/recipeImports/r2'), { ...ok, status: 'done' }));
    await assertFails(setDoc(doc(db('alice'), 'users/alice/recipeImports/r3'), { ...ok, recipe: { name: 'x' } }));
    await assertFails(setDoc(doc(db('alice'), 'users/alice/recipeImports/r4'), { ...ok, url: 'file:///etc/passwd' }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice/recipeImports/r1'), { status: 'done' }));
    await assertFails(setDoc(doc(db('bob'), 'users/alice/recipeImports/r5'), ok));
    await assertFails(getDoc(doc(db('bob'), 'users/alice/recipeImports/r1')));
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/recipeImports/r1')));
  });
});

describe('custom emojis', () => {
  test('create with matching name; no overwrite; only creator deletes', async () => {
    const e = { name: 'legday', url: 'u', path: 'p', createdBy: 'bob' };
    await assertSucceeds(setDoc(doc(db('bob'), 'emojis/legday'), e));
    await assertFails(setDoc(doc(db('eve'), 'emojis/legday'), { ...e, createdBy: 'eve' }));
    await assertFails(setDoc(doc(db('eve'), 'emojis/Bad Name'), { ...e, name: 'Bad Name', createdBy: 'eve' }));
    await assertFails(setDoc(doc(db('eve'), 'emojis/spoof'), { ...e, name: 'spoof', createdBy: 'bob' }));
    await assertFails(deleteDoc(doc(db('eve'), 'emojis/legday')));
    await assertSucceeds(deleteDoc(doc(db('bob'), 'emojis/legday')));
  });
});

describe('storage', () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  test('upload images only into your own folder', async () => {
    const st = (uid) => env.authenticatedContext(uid).storage();
    await assertSucceeds(uploadBytes(ref(st('alice'), 'users/alice/posts/a.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st('bob'), 'users/alice/posts/b.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st('alice'), 'users/alice/posts/c.txt'), png, { contentType: 'text/plain' }));
    await assertSucceeds(uploadBytes(ref(st('bob'), 'emojis/bob/x.png'), png, { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(st('bob'), 'emojis/alice/x.png'), png, { contentType: 'image/png' }));
  });
});
