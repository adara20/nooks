# Nooks: System Architecture

This document serves as the primary "mental model" for the Nooks codebase. It describes how data flows, how logic is separated, and how the UI interacts with the system.

## 1. High-Level Data Flow (Local-First with Cloud Sync)

Nooks is a "local-first" application. IndexedDB is the primary source of truth, ensuring the app works flawlessly offline. When the user is signed in, writes are also mirrored to Firestore as a background sync — a Firebase failure **never** blocks a local write.

**Write flow (signed in):**
`User Input` → `Views` → `Repository (Singleton)` → `Dexie/IndexedDB` → `firebaseService.syncUpsert*` (fire-and-forget, errors swallowed)

**Initial sync on sign-in:**
`AuthContext.onAuthStateChanged` → `firebaseService.runInitialSync` → merge cloud→local via `backupService.mergeData` → push full local store back to Firestore

## 2. Core Layers

### A. Data Layer (`db.ts`, `services/repository.ts`)
- **`db.ts`**: Defines the Dexie schema, handles schema migrations, and exports the `db` singleton.
- **`services/repository.ts`**: The central API for the entire app. **NEVER** call the database directly from a component; always use the `repository` singleton.
  - All CRUD operations for `Bucket` and `Task` go through here.
  - Side effects (e.g., setting `completedAt` when a task is marked done) are handled here, not in components.

### B. Business Logic Layer (`services/`)
We keep the "Brain" of the app separate from the "Face" (UI):
- **`nudgeService.ts`**: Pure function that takes the current task list, last export date, and `isSignedIn` flag and returns nudge cards for the Home screen. The `backup-overdue` nudge is suppressed when `isSignedIn` is `true`. No DB calls, no side effects.
- **`backupService.ts`**: Pure functions for JSON data export/import. Handles serialisation (`exportData`, `triggerDownload`), validation (`validateBackup`), merge-deduplication (`mergeData`), and last-export tracking via `localStorage` (`getLastExportDate`, `setLastExportDate`). No DB calls — import coordination (clear + seed) lives in `SettingsView`.
- **`firebaseService.ts`**: Firebase initialisation, auth helpers (`signUpWithEmail`, `signInWithEmail`, `signOutUser`, `onAuthChange`), fire-and-forget sync helpers (`syncUpsertTask/Bucket`, `syncDeleteTask/Bucket`), and initial-sync helpers (`fetchCloudData`, `pushAllToCloud`, `runInitialSync`). All sync functions are no-ops when the user is signed out; errors are swallowed so they never crash local writes.

### C. Auth / Sync Layer (`context/AuthContext.tsx`)
- **`AuthContext.tsx`**: Wraps `onAuthStateChanged`. Exposes `user`, `isSignedIn`, `authLoading`, `syncStatus` (`idle | syncing | synced | error`), and `signIn/signUp/signOut` helpers.
- On mount the app shows a loading screen until both `authLoading` and `isInitialized` are `false`.
- On first sign-in per session (deduped via `useRef<Set<string>>`), `runInitialSync` is called; `syncStatus` transitions `idle → syncing → synced | error`.
- `signOut` resets `syncStatus` to `idle`.

### D. View Layer (`views/`, `App.tsx`)
- **`App.tsx`**: The orchestrator. Manages the active view (`AppView = TabType | 'settings'`) and global navigation state. The `BottomNav` is hidden when Settings is active.
- **View Components** (`views/`): Flat hierarchy. Views fetch what they need from the `repository` via `useLiveQuery` on mount.
- **`components/`**: Shared, reusable UI primitives (Button, Card, Modal, BottomNav).

## 3. Data Model

### Bucket
The top-level organizational container. A Bucket is never "done" — it lives until the user deletes it.
```ts
interface Bucket {
  id?: number;       // auto-incremented
  name: string;
  emoji: string;     // user-selected emoji
  createdAt: Date;
}
```

### Task
The core actionable unit. Tasks live inside a Bucket.
```ts
interface Task {
  id?: number;          // auto-incremented
  title: string;
  details?: string;
  bucketId?: number;    // FK to Bucket (optional — tasks can be unassigned)
  status: 'todo' | 'in-progress' | 'backlog' | 'done';
  isUrgent: boolean;
  isImportant: boolean;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;   // set automatically when status → 'done'
}
```

## 4. Navigation & Views

Three primary tabs + one overlay view, managed by `App.tsx`:
- **Home** — nudge cards and task count summary stats. Gear icon (⚙) in header opens Settings.
- **Tasks** — active task list with bucket filter bar; toggles to Quadrant view
- **Calendar** — tasks with due dates shown on a monthly grid
- **Settings** — Cloud Backup card (sign-in / account status) followed by JSON backup section. Accessed via the Home gear icon, not the BottomNav. `BottomNav` is hidden when Settings is active.

Completed tasks are accessible by filtering for `done` status from the Home view stats cards.

## 5. Cloud Sync (Firebase)

- **Auth**: Email/password via Firebase Auth. Handled in `firebaseService.ts`; auth state surfaced app-wide via `AuthContext`.
- **Firestore structure**: `users/{uid}/tasks/{taskId}` and `users/{uid}/buckets/{bucketId}`. JS `Date` fields are serialised to Firestore `Timestamp` on write and deserialised back on read.
- **Per-write sync**: Every `repository.add/update/delete` call mirrors the change to Firestore (fire-and-forget; no-op when signed out).
- **Initial sync**: On first sign-in per session, `runInitialSync` fetches cloud data, merges cloud→local using `mergeData` (union, no overwrites), then pushes the full updated local store back to Firestore.
- **Security rules**: `allow read, write: if request.auth != null && request.auth.uid == userId` — data is fully isolated per user.
- **Environment variables**: All Firebase config values are loaded from `VITE_FIREBASE_*` env vars (never committed). See `.env.example` for required keys.

## 6. Data Export / Import (JSON)

Manual JSON backup flow — preserved for offline/legacy use:

- **Export**: `backupService.exportData()` serialises all Buckets and Tasks from the DB into a `NooksBackup` JSON object; `triggerDownload()` pushes it as a file download.
- **Import (Merge)**: Reads the uploaded JSON, validates the schema with `validateBackup()`, then calls `backupService.mergeData()` which strips IDs and deduplicates (buckets by case-insensitive name, tasks by `title::bucketName`). Unique items are added via `repository.addBucket/addTask`.
- **Import (Replace)**: Clears both tables (`db.buckets.clear()`, `db.tasks.clear()`) then seeds from the backup — prompts the user for a confirmation before executing.
- **Staleness Nudge**: `nudgeService.ts` emits a `backup-overdue` nudge when `lastExportDate` is `null` or ≥ 3 days old **and** `isSignedIn` is `false`. When signed in, cloud sync is considered an adequate backup, so the nudge is suppressed.
- **`localStorage` key**: `nooks_last_export` — stores ISO timestamp of last successful export.

## 7. Testing Philosophy
- **Unit Tests**: Located next to the source file (e.g., `nudgeService.test.ts`). Focus on pure logic.
- **Integration/View Tests**: Also located next to the source file (e.g., `HomeView.test.tsx`). Test rendered behaviour, user interactions, and navigation wiring using React Testing Library. `dexie-react-hooks`, `motion/react`, and `services/repository` are mocked so tests run without a real DB or animation engine.
- **Test Setup**: `src/tests/setup.ts` — provides a fresh `fake-indexeddb` instance before each test.
- **Factories**: `src/tests/factories.ts` — always use factories to generate mock data. Never hardcode objects in tests.
- **Coverage Target**: >85% overall, >80% for any modified file. All views (`App.tsx`, `HomeView`, `TasksView`, `CalendarView`) are covered at ≥90% statement coverage.

## 8. Maintenance Rules
- **Schema Changes**: If you update `db.ts` or the types in `db.ts`, you MUST update this document.
- **New Services**: If you add a file to `/services`, update the Business Logic Layer section above.
- **New Views**: If you add a view, update the Navigation & Views section above.
