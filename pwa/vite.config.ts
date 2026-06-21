import { defineConfig } from 'vitest/config';
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
        theme_color: '#273449',
        background_color: '#273449',
        display: 'standalone',
        icons: [],
      },
      workbox: { navigateFallbackDenylist: [/^\/__/] },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5174, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testing/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: { lines: 75, functions: 75, branches: 70, statements: 75 },
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/testing/**', 'src/**/*.d.ts', 'src/main.tsx'],
    },
  },
});
