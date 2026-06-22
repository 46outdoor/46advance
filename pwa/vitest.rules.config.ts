import { defineConfig } from 'vitest/config';

// Firestore security-rules tests run in Node against the Firestore emulator
// (started by `npm run test:rules` via `firebase emulators:exec`). They are kept
// out of the default jsdom suite (see `exclude` in vite.config.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.rules.test.ts'],
    globals: true,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // One shared emulator namespace — don't run rules files in parallel.
    fileParallelism: false,
  },
});
