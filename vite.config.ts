import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const API_PORT = process.env.API_PORT ?? '4310';

export default defineConfig(({ mode }) => {
  // Load .env files so VITE_BASE / VITE_DATA_BACKEND can be set from a file as
  // well as from the shell (the Pages workflow passes them as env vars).
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };

  // GitHub Pages serves the app from https://<user>.github.io/<repo>/, so every
  // asset URL needs that prefix. Must start and end with a slash.
  const base = env.VITE_BASE ?? '/';

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // Validation shared with the Node server. Must match the tsconfig path
        // and the vitest alias, or one of the three resolves differently.
        '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      },
    },
    define: {
      // Surfaced in Settings so a deployed build can identify itself.
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    server: {
      port: 5173,
      // Dev: the React app runs on 5173 and forwards data calls to the Node API.
      proxy: {
        '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      // The firebase chunk is ~630 kB raw / ~150 kB gzipped and cannot be made
      // meaningfully smaller — auth and firestore are both needed on first
      // paint. It is already isolated below, so the default 500 kB warning is
      // just noise.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // Firebase is large and changes rarely — keeping it in its own chunk
          // means an app-code deploy does not invalidate it in the CDN cache.
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'firebase';
            }
            if (id.includes('node_modules/chart.js') || id.includes('node_modules/react-chartjs-2')) {
              return 'charts';
            }
            if (id.includes('node_modules/d3')) {
              return 'graph';
            }
          },
        },
      },
    },
  };
});
