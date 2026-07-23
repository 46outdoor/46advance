/**
 * Firebase Web SDK initialization (shared client). Config comes from VITE_FIREBASE_*
 * (public client values). Firestore uses persistent local cache (offline support).
 * Set VITE_USE_EMULATORS=true to point at the local emulators.
 */
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  terminate,
  clearIndexedDbPersistence,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);

// App Check (WS-I): attests requests come from the genuine app. INERT until a reCAPTCHA v3 site key
// is provisioned via VITE_APPCHECK_SITE_KEY, and skipped under the emulators. Enforcement is enabled
// separately in the Firebase console ("observe first" → validate → enforce), so shipping this can't
// lock anyone out before enforcement is deliberately turned on.
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY as string | undefined;
if (appCheckSiteKey && import.meta.env.VITE_USE_EMULATORS !== 'true') {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

/**
 * Clear the Firestore persistent (IndexedDB) cache so one account's cached documents can't
 * be served to the next account on a shared browser. `terminate` is required first, which
 * leaves the instance unusable — the caller MUST reload the app afterward to reinitialize
 * Firestore (see AuthProvider.signOut). Best-effort: `clearIndexedDbPersistence` rejects if
 * another tab still holds the database, so callers should catch and proceed to reload.
 */
export async function clearFirestoreCache(): Promise<void> {
  await terminate(db);
  await clearIndexedDbPersistence(db);
}
