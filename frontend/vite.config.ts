/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

const BACKEND_URL = 'http://localhost:3333';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Bundle stats -> build/stats.html (see nginx note in frontend/CLAUDE.md).
    visualizer({
      filename: 'build/stats.html',
      gzipSize: true,
      open: false,
    }),
  ],
  server: {
    port: 3001,
    strictPort: false,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/ws': {
        target: BACKEND_URL,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    // Keep "build" (not Vite's default "dist"): Dockerfile, nginx and the
    // docker-compose healthcheck all point at frontend/build.
    outDir: 'build',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    css: true,
    // CRA's jest preset reset mocks between tests; keep call-history isolation.
    clearMocks: true,
    exclude: ['node_modules/**', 'build/**'],
    // Force the same-origin fallbacks in src/api.ts during tests, so a local
    // .env with VITE_API_URL/VITE_WS_URL set can't change assertions.
    env: {
      VITE_API_URL: '',
      VITE_WS_URL: '',
    },
  },
});
