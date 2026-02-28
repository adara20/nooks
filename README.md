# Nooks

A warm, personal task management PWA organised around user-created **Buckets**. Built local-first — everything works offline, with optional Firebase cloud sync.

## Tech Stack

- **React + TypeScript** — UI and type safety
- **Vite** — build tool and dev server
- **Dexie (IndexedDB)** — local-first data storage, primary source of truth
- **Firebase** — Auth (email/password) and Firestore (cloud sync + contributor inbox)
- **Tailwind CSS** — styling
- **Vitest + React Testing Library** — test suite

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the example env file and fill in your Firebase project credentials:
   ```
   cp .env.example .env
   ```

   The following variables are required (all found in your Firebase project settings):
   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   VITE_FIREBASE_MEASUREMENT_ID=
   ```

3. Start the dev server:
   ```
   npm run dev
   ```

## Testing

```bash
npm test                 # run once
npm run test:watch       # watch mode
npm run test:coverage    # with coverage report
npm run lint             # type-check
```
