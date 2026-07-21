import { defineConfig, devices } from '@playwright/test';

/**
 * Authenticated E2E against the Firebase emulators (Phase 0 / S0).
 *
 * Run: `npm run test:e2e:emulator` — that wraps this in `firebase emulators:exec`
 * (demo-46advance) so the Auth/Firestore/Storage emulators are up and the globalSetup
 * seeder can target them. Kept on a distinct port from the plain smoke config so the
 * two never collide, and always starts its own dev server so VITE_USE_EMULATORS applies.
 *
 * Not yet wired into CI; the CI lane (Java + firebase-tools + seeded emulators) lands
 * with WS-J / S13.
 */
const PORT = 4747;

// Point the app at the local emulators. The client reads VITE_USE_EMULATORS in
// src/services/firebase.ts and connects to the hardcoded 127.0.0.1 emulator ports;
// the project id must be demo-46advance to match the seeded namespace.
const emulatorAppEnv = {
  VITE_USE_EMULATORS: 'true',
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-46advance.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-46advance',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-46advance.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: 'demo-app-id',
};

export default defineConfig({
  testDir: './tests/emulator',
  testMatch: '**/*.emulator.spec.ts',
  globalSetup: './tests/emulator/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: emulatorAppEnv,
  },
});
