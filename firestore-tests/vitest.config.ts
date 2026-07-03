import { defineConfig } from 'vitest/config';

// Standalone config for the Firestore security-rules tests. These run against
// the Firestore emulator (started by `firebase emulators:exec`), so they use a
// plain Node environment with NO jsdom / fake-indexeddb setup — unlike the main
// app suite. Invoked via `npm run test:rules`, never by `npm test`.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['firestore-tests/**/*.test.ts'],
    // Rules evaluation + emulator round-trips are slower than unit tests.
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
