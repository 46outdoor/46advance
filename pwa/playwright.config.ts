import { defineConfig, devices } from '@playwright/test';

const PORT = 4646;

// Dummy, non-secret Firebase config so the app boots without .env.local (mirrors vite.config's
// test env). The smoke suite only exercises unauthenticated pages, which make no network calls.
const dummyFirebaseEnv = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-test',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-test.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: 'test-app-id',
};

/**
 * Playwright E2E config. Run: `npx playwright install chromium` once, then `npm run test:e2e`.
 * Not wired into CI (the pipeline runs unit + rules tests); this is a local/opt-in smoke net.
 */
export default defineConfig({
  testDir: './tests',
  // The authenticated emulator suite has its own config (playwright.emulator.config.ts)
  // and boots the Firebase emulators; keep it out of this unauthenticated smoke net.
  testIgnore: '**/*.emulator.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: dummyFirebaseEnv,
  },
});
