import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Test config, separate from vite.config.ts.
 *
 * The tests exercise the server modules and the pure selector logic, so they
 * run in Node and do not need the React plugin or JSX transform.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Board validation is shared between the Node server and the browser
      // bundle; tests import it through the same specifier the app uses.
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}'],
    reporters: ['default'],
  },
});
