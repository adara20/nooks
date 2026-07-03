import { execSync } from 'child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Prefer Vercel's build-time env var (always available on Vercel, no .git
// checkout needed); fall back to reading git directly for local builds.
function getBuildSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(getBuildSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // use existing public/manifest.json
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    // functions/lib is tsc's gitignored build output for the Cloud Functions
    // package (compiled to CommonJS) — exclude it so a local `npm run build`
    // in functions/ doesn't leave behind .test.js files that collide with
    // the real functions/src tests when running the suite from the root.
    // firestore-tests/** run against the Firestore emulator via a separate
    // config (`npm run test:rules`) — keep them out of the jsdom app suite.
    exclude: [...configDefaults.exclude, 'functions/lib/**', 'firestore-tests/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/', 'src/tests/'],
    },
  },
});
