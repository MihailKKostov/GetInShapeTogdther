import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === 'true';

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-gist.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-gist',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-gist.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '0',
  appId: env.VITE_FIREBASE_APP_ID || '1:0:web:0',
};

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: useEmulators
    ? undefined
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);

if (useEmulators) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
}

export const isConfigured = useEmulators || Boolean(env.VITE_FIREBASE_API_KEY);
