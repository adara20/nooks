# Nooks: System Architecture

This document serves as the primary "mental model" for the Nooks codebase. It describes how data flows, how logic is separated, and how the UI interacts with the system.

## 1. High-Level Data Flow (Local-First)

Nooks is a "local-first" application. IndexedDB is the primary source of truth, ensuring the app works flawlessly offline and that each user's data is entirely private to their own device.

**Flow:**
`User Input` → `Views` → `Repository (Singleton)` → `Dexie/IndexedDB`

**Future:**
`Repository` → `Cloud Sync (Firebase)` ← planned as a future feature

## 2. Core Layers

### A. Data Layer (`db.ts`, `services/repository.ts`)
- **`db.ts`**: Defines the Dexie schema, handles schema migrations, and exports the `db` singleton.
- **`services/repository.ts`**: The central API for the entire app. **NEVER** call the database directly from a component; always use the `repository` singleton.
  - All CRUD operations for `Bucket` and `Task` go through here.
  - Side effects (e.g., setting `completedAt` when a task is marked done) are handled here, not in components.

### B. Business Logic Layer (`services/`)
We keep the "Brain" of the app separate from the "Face" (UI):
- **`nudgeService.ts`**: Pure function that takes the current task list + last export date and returns nudge cards for the Home screen. No DB calls, no side effects.
- **`backupService.ts`**: Pure functions for JSON data export/import. Handles serialisation (`exportData`, `triggerDownload`), validation (`validateBackup`), merge-deduplication (`mergeData`), and last-export tracking via `localStorage` (`getLastExportDate`, `setLastExportDate`). No DB calls — import coordination (clear + seed) lives in `SettingsView`.

### C. View Layer (`views/`, `App.tsx`)
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
- **Settings** — data export/import (JSON backup). Accessed via the Home gear icon, not the BottomNav. `BottomNav` is hidden when Settings is active.

Completed tasks are accessible by filtering for `done` status from the Home view stats cards.

## 5. Data Export / Import

Data resilience is handled client-side via a manual JSON backup flow:

- **Export**: `backupService.exportData()` serialises all Buckets and Tasks from the DB into a `NooksBackup` JSON object; `triggerDownload()` pushes it as a file download.
- **Import (Merge)**: Reads the uploaded JSON, validates the schema with `validateBackup()`, then calls `backupService.mergeData()` which strips IDs and deduplicates (buckets by case-insensitive name, tasks by `title::bucketName`). Unique items are added via `repository.addBucket/addTask`.
- **Import (Replace)**: Clears both tables (`db.buckets.clear()`, `db.tasks.clear()`) then seeds from the backup — prompts the user for a confirmation before executing.
- **Staleness Nudge**: `nudgeService.ts` emits a `backup-overdue` nudge when `lastExportDate` is `null` or ≥ 3 days old. Tapping the nudge navigates to Settings.
- **`localStorage` key**: `nooks_last_export` — stores ISO timestamp of last successful export.

## 6. Testing Philosophy
- **Unit Tests**: Located next to the source file (e.g., `nudgeService.test.ts`). Focus on pure logic.
- **Integration/View Tests**: Also located next to the source file (e.g., `HomeView.test.tsx`). Test rendered behaviour, user interactions, and navigation wiring using React Testing Library. `dexie-react-hooks`, `motion/react`, and `services/repository` are mocked so tests run without a real DB or animation engine.
- **Test Setup**: `src/tests/setup.ts` — provides a fresh `fake-indexeddb` instance before each test.
- **Factories**: `src/tests/factories.ts` — always use factories to generate mock data. Never hardcode objects in tests.
- **Coverage Target**: >85% overall, >80% for any modified file. All views (`App.tsx`, `HomeView`, `TasksView`, `CalendarView`) are covered at ≥90% statement coverage.

## 7. Maintenance Rules
- **Schema Changes**: If you update `db.ts` or the types in `db.ts`, you MUST update this document.
- **New Services**: If you add a file to `/services`, update the Business Logic Layer section above.
- **New Views**: If you add a view, update the Navigation & Views section above.
