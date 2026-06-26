import { defineConfig } from 'vitest/config';

// Cloud Functions unit tests (pure helpers). Run in Node via `npm run test`.
// Test files are excluded from the tsc deploy build (see tsconfig.json) so they
// never ship to production.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
