import { defineConfig } from 'vitest/config';

// Cloud Functions HANDLER tests — invoke deployed callables via firebase-functions-test
// against the real Auth + Firestore emulators (started by `npm run test:emulator` via
// `firebase emulators:exec`). The Admin SDK auto-connects when emulators:exec exports
// FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST, so there are no mocks — tests
// assert against real emulated state. Kept out of the default `npm run test` suite
// (see the exclude in vitest.config.ts) since that runs without an emulator.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.emulator.test.ts'],
    globals: true,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // One shared emulator namespace — don't run emulator files in parallel.
    fileParallelism: false,
    // index.ts reads ADMIN_EMAILS once at module load, so pin a known allowlist here (applied
    // before test modules import index.ts) — the syncUserClaims tests key off this address.
    env: { ADMIN_EMAILS: 'owner@allow.test' },
  },
});
