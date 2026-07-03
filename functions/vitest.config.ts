import { defineConfig, configDefaults } from 'vitest/config';

// lib/ is tsc's gitignored build output (CommonJS) — exclude it so a local
// `npm run build` doesn't leave behind .test.js files that collide with the
// real src/ tests when running `npm test` from within this package.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'lib/**'],
  },
});
