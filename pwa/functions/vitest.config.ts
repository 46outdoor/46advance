import { configDefaults, defineConfig } from 'vitest/config';

// Cloud Functions unit tests (pure helpers). Run in Node via `npm run test`.
// Test files are excluded from the tsc deploy build (see tsconfig.json) so they
// never ship to production.
//
// `*.emulator.test.ts` files need the Auth + Firestore emulators running, so they
// are excluded here and driven by `npm run test:emulator` (vitest.emulator.config.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.emulator.test.ts'],
  },
});
