import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// In test mode, resolve svelte imports via the `browser` condition so the
// client-side lifecycle (onMount, tick, etc.) actually fires under
// @testing-library/svelte v4 + vitest. Without this, svelte's SSR exports
// are picked and `onMount` is a no-op — which silently left every route's
// `onMount(refresh)` unfired in tests, so components rendered with their
// initial empty state and tests polled to timeout waiting for data that
// was written but never re-read.
export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  worker: { format: 'es' },
  build: {
    target: 'es2020',
    outDir: 'dist'
  },
  resolve: {
    conditions: process.env.VITEST ? ['browser'] : []
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000
  }
});
