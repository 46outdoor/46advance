import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '46 Advance',
        short_name: '46 Advance',
        description: 'Festival artist advance management for 46 Entertainment',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/__/] },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Shared callable contracts (Zod schemas) — single source of truth consumed
      // by the client (types) and the Functions handlers (runtime .parse).
      '@contracts': fileURLToPath(new URL('./functions/src/contracts', import.meta.url)),
    },
  },
  server: { port: 4646, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Route code is already lazy-loaded; split the heavy vendor deps into their
        // own long-cached chunks so no single chunk trips the 500 KB warning and a
        // deploy doesn't invalidate vendor caches.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase') || id.includes('@firebase')) return 'vendor-firebase';
          if (id.includes('@sentry')) return 'vendor-sentry';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testing/setup.ts'],
    // Rules tests run in Node against the emulator via vitest.rules.config.ts.
    // Cloud Functions tests run in functions/ via its own Vitest (the `functions`
    // CI job); exclude them here so this jsdom suite never imports firebase-admin.
    exclude: [...configDefaults.exclude, 'test/**/*.rules.test.ts', 'functions/**'],
    css: true,
    // Dummy Firebase config so `services/firebase.ts` can initialize under test
    // (CI has no .env.local). Non-secret placeholders; no network at init.
    env: {
      VITE_FIREBASE_API_KEY: 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-test.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-test',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-test.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
      VITE_FIREBASE_APP_ID: 'test-app-id',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/testing/**', 'src/**/*.d.ts', 'src/main.tsx'],
      // A low GLOBAL floor (locks overall coverage; ratchet up over time) plus HIGH
      // per-directory bars that lock in the well-covered pure business-logic libs so
      // they can't regress. Numbers track current coverage with a small margin — raise
      // them as coverage improves. (rbac/schedules `functions` are genuinely lower, so
      // their bars are set accordingly rather than aspirationally.)
      thresholds: {
        statements: 20,
        branches: 75,
        functions: 18,
        lines: 20,
        'src/lib/advances/**': { statements: 95, branches: 88, functions: 90, lines: 95 },
        'src/lib/events/**': { statements: 95, branches: 78, functions: 90, lines: 95 },
        'src/lib/quotes/**': { statements: 95, branches: 95, functions: 95, lines: 95 },
        'src/lib/rbac/**': { statements: 78, branches: 90, functions: 70, lines: 78 },
        'src/lib/schedules/**': { statements: 90, branches: 90, functions: 28, lines: 90 },
      },
    },
  },
});
