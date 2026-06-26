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
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 4646, strictPort: true },
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
      // Coverage thresholds not enforced yet (scaffold has minimal logic).
      // TODO: restore target 75/75/70 as features land (Phase 1+).
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/testing/**', 'src/**/*.d.ts', 'src/main.tsx'],
    },
  },
});
