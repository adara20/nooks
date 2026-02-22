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
- **`nudgeService.ts`**: Pure functions that take the current task list and return nudge cards to display on the Home screen. No DB calls, no side effects.

### C. View Layer (`views/`, `App.tsx`)
- **`App.tsx`**: The orchestrator. Manages the active tab and global navigation state.
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

Three primary tabs managed by `App.tsx`:
- **Home** — nudge cards and task count summary stats
- **Tasks** — active task list with bucket filter bar; toggles to Quadrant view
- **Calendar** — tasks with due dates shown on a monthly grid

Completed tasks are accessible by filtering for `done` status from the Home view stats cards.

## 5. Testing Philosophy
- **Unit Tests**: Located next to the source file (e.g., `nudgeService.test.ts`). Focus on pure logic.
- **Test Setup**: `src/tests/setup.ts` — provides a fresh `fake-indexeddb` instance before each test.
- **Factories**: `src/tests/factories.ts` — always use factories to generate mock data. Never hardcode objects in tests.
- **Coverage Target**: >85% overall, >80% for any modified file.

## 6. Maintenance Rules
- **Schema Changes**: If you update `db.ts` or the types in `db.ts`, you MUST update this document.
- **New Services**: If you add a file to `/services`, update the Business Logic Layer section above.
- **New Views**: If you add a view, update the Navigation & Views section above.
