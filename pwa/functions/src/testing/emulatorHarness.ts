/**
 * Test harness for the emulator-backed callable handler tests (`*.emulator.test.ts`).
 *
 * These run under `npm run test:emulator`, which starts the Auth + Firestore emulators via
 * `firebase emulators:exec` and exports FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST.
 * The Admin SDK auto-connects to those, so handlers read/write real emulated state — no mocks.
 * firebase-functions-test's `wrap()` invokes a gen-2 callable with a synthetic CallableRequest.
 */
import functionsTest from 'firebase-functions-test';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { CallableRequest } from 'firebase-functions/v2/https';

// The emulator's project id — emulators:exec exports GCLOUD_PROJECT/FIREBASE_PROJECT. Capture it
// BEFORE firebase-functions-test runs: its offline mode resets GCLOUD_PROJECT to a placeholder
// ('not-a-project'), and the Admin SDK resolves the project lazily per API call, so an unrestored
// reset would send reads/writes (and the REST clear) to the wrong namespace.
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? 'demo-46advance';

/** Offline test env — we drive Admin IO ourselves via the emulator, so no project config. */
export const testEnv = functionsTest();

// Restore the project id the offline env clobbered, so Admin SDK calls target the emulator.
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.GCP_PROJECT = PROJECT_ID;

/** A DecodedIdToken carrying the given custom claims (admin/approved/organizer/email/…). */
export function fakeToken(claims: Record<string, unknown> = {}): DecodedIdToken {
  const uid = typeof claims.uid === 'string' ? claims.uid : 'test-uid';
  const base = {
    aud: PROJECT_ID,
    auth_time: 0,
    exp: 0,
    iat: 0,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    sub: uid,
    uid,
    firebase: { identities: {}, sign_in_provider: 'custom' },
  };
  return { ...base, ...claims } as unknown as DecodedIdToken;
}

/** Auth context for a signed-in caller with the given uid + custom claims. */
export function authContext(uid: string, claims: Record<string, unknown> = {}): { uid: string; token: DecodedIdToken } {
  return { uid, token: fakeToken({ uid, ...claims }) };
}

/** Build the CallableRequest a wrapped v2 callable expects. Omit `auth` for an unauthenticated call. */
export function callableRequest<T>(
  data: T,
  auth?: { uid: string; token: DecodedIdToken },
): CallableRequest<T> {
  return { data, auth, rawRequest: { headers: {} }, acceptsStreaming: false } as unknown as CallableRequest<T>;
}

/** Wipe every Firestore doc + Auth account in the emulator. Call in `beforeEach` for isolation. */
export async function clearEmulators(): Promise<void> {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (firestoreHost) {
    await fetch(
      `http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: 'DELETE' },
    );
  }
  if (authHost) {
    await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
  }
}
