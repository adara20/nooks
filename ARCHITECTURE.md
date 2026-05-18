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
- **`db.ts`**: Defines the Dexie schema (currently at **version 2**), handles schema migrations, and exports the `db` singleton.
- **`services/repository.ts`**: The central API for the entire app. **NEVER** call the database directly from a component; always use the `repository` singleton.
  - All CRUD operations for `Bucket` and `Task` go through here.
  - Side effects (e.g., setting `completedAt` when a task is marked done) are handled here, not in components.

### B. Business Logic Layer (`services/`)
We keep the "Brain" of the app separate from the "Face" (UI):
- **`notificationsSeenService.ts`**: Deduplication store for real-time toast notifications. `hasSeen(eventId)` returns `true` if an event has already been shown; `markSeen(eventId)` records it. Backed by the `notificationsSeen` Dexie table (schema v2). Prevents duplicate toasts on cold-start when Firestore's cache replays existing documents.
- **`nudgeService.ts`**: Pure function that takes the current task list, last export date, `isSignedIn`, and `pendingInboxCount` and returns nudge cards for the Home screen. The `backup-overdue` nudge is suppressed when `isSignedIn` is `true`. The `inbox-pending` nudge is emitted first when `pendingInboxCount > 0`. No DB calls, no side effects.
- **`backupService.ts`**: Pure functions for JSON data export/import. Handles serialisation (`exportData`, `triggerDownload`), validation (`validateBackup`), merge-deduplication (`mergeData`), and last-export tracking via `localStorage` (`getLastExportDate`, `setLastExportDate`). No DB calls — import coordination (clear + seed) lives in `SettingsView`.
- **`firebaseService.ts`**: Firebase initialisation, auth helpers (`signUpWithEmail`, `signInWithEmail`, `signOutUser`, `onAuthChange`), fire-and-forget sync helpers (`syncUpsertTask/Bucket`, `syncDeleteTask/Bucket`), and initial-sync helpers (`fetchCloudData`, `pushAllToCloud`, `runInitialSync`). All sync functions are no-ops when the user is signed out; errors are swallowed so they never crash local writes.
- **`fcmService.ts`**: Firebase Cloud Messaging client helpers. `isFcmSupported()` checks browser/device support. `getNotificationPermission()` returns the current `Notification.permission` state. `requestPermissionAndSaveToken()` requests OS permission (must be called from a user gesture), resolves the active SW registration via `navigator.serviceWorker.ready` (so Firebase uses our custom `/sw.js` rather than looking for the default `/firebase-messaging-sw.js`), obtains the FCM registration token via `getToken`, and stores it under `users/{uid}/fcmTokens/{token}` in Firestore with a `serverTimestamp` and `platform` field. Returns `null` on failure (unsupported, denied, or token fetch error). `PushNotificationsCard` in `SettingsView` calls this from a user gesture on first enable, and also automatically on mount when permission is already `'granted'` (ensures the token is registered even if a previous attempt failed silently, e.g. due to a missing env var in a previous deployment).
- **`contributorService.ts`**: All Contributor Mode logic. Invite code generation/redemption (`generateInviteCode`, `redeemInviteCode`), permission CRUD (`getContributorPermission`, `removeContributorPermission`), inbox CRUD (`submitInboxTask`, `fetchPendingInboxItems`, `getPendingInboxCount`, `acceptInboxItem`, `declineInboxItem`, `deleteInboxItem`), contributor submission queries (`getContributorSubmissions`), live task status fetch (`getAcceptedTaskStatus`), `localStorage` helpers for app mode (`getAppMode`, `setAppMode`, `getStoredOwnerUID`, `storeOwnerInfo`, `clearOwnerInfo`), and dismiss helpers (`getDismissedSubmissionIds`, `dismissSubmission`, `clearDismissedSubmissions`). All Firestore writes target `users/{uid}/inbox` or `invites/{code}` — never the owner's `tasks` collection, preserving data isolation. The one read exception is `getAcceptedTaskStatus`, which reads a single owner task using `taskId` stored on the accepted inbox item; the Firestore security rule gates this via `resource.data.contributorUID == request.auth.uid`.

### C. Auth / Sync Layer (`context/AuthContext.tsx`)
- **`AuthContext.tsx`**: Wraps `onAuthStateChanged`. Exposes `user`, `isSignedIn`, `authLoading`, `syncStatus` (`idle | syncing | synced | error`), and `signIn/signUp/signOut` helpers.
- **`NotificationProvider.tsx`** (PR 1 — foreground toasts): Mounts real-time Firestore `onSnapshot` listeners and renders a global `<Toaster />` (Sonner, `richColors`, `top-center`). In **owner mode** it listens to `users/{uid}/inbox` for new submissions and shows `📥 New submission from …` toasts. In **contributor mode** it listens to the owner's inbox (filtered by `contributorUID`) for `accepted`/`declined` status changes and to the owner's tasks (filtered by `contributorUID`) for any status change. All listeners skip the first snapshot when `fromCache === true` to prevent cold-start spam, and use `notificationsSeenService` to deduplicate across sessions. Wrapped around `<App />` inside `AuthProvider` in `main.tsx`.
- On mount the app shows a loading screen until both `authLoading` and `isInitialized` are `false`.
- On first sign-in per session (deduped via `useRef<Set<string>>`), `runInitialSync` is called; `syncStatus` transitions `idle → syncing → synced | error`.
- `signOut` resets `syncStatus` to `idle`.

### D. View Layer (`views/`, `App.tsx`)
- **`App.tsx`**: The orchestrator. Manages the active view (`AppView = TabType | 'settings'`) and global navigation state. The `BottomNav` is hidden when Settings is active. On mount it reads the `?open=` query param (injected by the SW `notificationclick` handler) and navigates to the appropriate view before stripping the param via `history.replaceState`.
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
  id?: number;               // auto-incremented
  title: string;
  details?: string;
  bucketId?: number;         // FK to Bucket (optional — tasks can be unassigned)
  status: 'todo' | 'in-progress' | 'backlog' | 'done';
  isUrgent: boolean;
  isImportant: boolean;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;        // set automatically when status → 'done'
  contributorUID?: string;   // set when task originated from a contributor inbox submission;
                             // used by the Firestore security rule that lets the contributor
                             // read the live task status via getAcceptedTaskStatus
}
```

### NotificationSeen
A deduplication record stored in IndexedDB only. Prevents the same toast from appearing more than once across sessions.
```ts
interface NotificationSeen {
  id?: number;    // auto-incremented
  eventId: string; // unique — format: inbox:created:{id} | inbox:status:{id}:{status} | task:status:{id}:{status}
}
```
Added in **Dexie schema version 2**. This table is never synced to Firestore.

### InboxItem
A contributor's task submission, stored in Firestore only (never in IndexedDB). Owned by the owner's UID.
```ts
interface InboxItem {
  id: string;               // Firestore doc ID
  title: string;
  details?: string;
  isUrgent: boolean;
  isImportant: boolean;
  dueDate?: Date;
  contributorUID: string;
  contributorEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  taskId?: number;          // set after acceptance — local Dexie Task ID
  createdAt: Date;
}
```

## 4. Navigation & Views

Three primary tabs + one overlay view, managed by `App.tsx`. Routing is **mode-aware**: when `appMode === 'contributor'` (read from `localStorage`), the Home tab renders `ContributorHomeView` instead of `HomeView`.

**Owner mode (default):**
- **Home** — nudge cards and task count summary stats. Gear icon (⚙) in header opens Settings. When `pendingInboxCount > 0`, an `inbox-pending` nudge is shown; clicking it navigates to `TasksView` with `initialStatusFilter='inbox'`.
- **Tasks** — active task list with bucket filter bar; toggles to Quadrant view. When `initialStatusFilter === 'inbox'`, renders the inbox review panel (fetched from Firestore) with Accept / Decline actions instead of the normal task list. No FAB is shown in inbox view.
- **Calendar** — tasks with due dates shown on a monthly grid.
- **Settings** — "Sharing" section (App Mode toggle + invite code generation/redemption) followed by Cloud Backup card and JSON backup section. Accessed via the Home gear icon, not the BottomNav. `BottomNav` is hidden when Settings is active.

**Contributor mode:**
- **Home** — `ContributorHomeView`: Settings gear icon (⚙) in header navigates to Settings. FAB opens a task-submission form. Submission list shows each item's status pill (Pending ⏳ / Accepted ✅ / Declined ❌). For accepted items with a `taskId`, the pill shows the live task status fetched from Firestore (To Do / In Progress / Done ✓). All items have a delete (🗑) button; non-pending items additionally have a dismiss (🙈) button that soft-hides the row locally. When items are dismissed, a `"X hidden · Reveal"` footer link or an "All caught up" empty state appears so the contributor can un-hide them.
- Calendar and Tasks tabs are not relevant in contributor mode (BottomNav is still present but only Home is active).

Completed tasks are accessible by filtering for `done` status from the Home view stats cards.

## 5. Cloud Sync (Firebase)

- **Auth**: Email/password via Firebase Auth. Handled in `firebaseService.ts`; auth state surfaced app-wide via `AuthContext`.
- **Firestore structure**:
  - `users/{uid}/tasks/{taskId}` and `users/{uid}/buckets/{bucketId}` — owner's local data, mirrored from IndexedDB. Tasks include `contributorUID` when created via inbox acceptance.
  - `users/{ownerUID}/inbox/{inboxId}` — contributor inbox items. **Never written to IndexedDB.** Contributor has create access (with matching `contributorUID`); owner has full read/write. **Creating a doc here also triggers the `onInboxCreated` Cloud Function** which sends a push notification to all of the owner's registered FCM tokens.
  - `users/{uid}/fcmTokens/{token}` — FCM registration tokens, one doc per device/browser. Written by `fcmService.requestPermissionAndSaveToken` on the client; read by the `onInboxCreated` Cloud Function to fan out push notifications. Stale tokens (rejected by FCM) are pruned automatically by the function after each send.
  - `invites/{code}` — invite codes with 7-day expiry. Anyone authenticated can read (to redeem); only the owner can write.
  - `users/{contributorUID}/permissions/contributor` — stores `ownerUID` and `ownerEmail` after invite redemption. Contributor reads/writes their own document only.
  - JS `Date` fields are serialised to Firestore `Timestamp` on write and deserialised back on read.
- **Per-write sync**: Every `repository.add/update/delete` call mirrors the change to Firestore (fire-and-forget; no-op when signed out).
- **Initial sync**: On first sign-in per session, `runInitialSync` fetches cloud data, merges cloud→local using `mergeData` (union, no overwrites), then pushes the full updated local store back to Firestore.
- **Security rules**: Managed in `firestore.rules` (committed to the repo) and deployed with `firebase deploy --only firestore:rules`. Key rules:
  - Owner data (tasks, buckets, fcmTokens): `allow read, write: if request.auth != null && request.auth.uid == userId` — fully isolated per user.
  - FCM tokens: same owner-only rule — clients write their own tokens; the Cloud Function reads them via Admin SDK (bypasses rules).
  - Inbox: contributor `create` if `request.resource.data.contributorUID == request.auth.uid`; contributor `read, delete` if `resource.data.contributorUID == request.auth.uid`.
  - Live task status: `allow read: if request.auth != null && resource.data.contributorUID == request.auth.uid` — lets the contributor read only tasks they originally submitted.
  - Invites: `allow create: if request.auth != null; allow read, update: if request.auth != null`.
- **Environment variables**: All Firebase config values are loaded from `VITE_FIREBASE_*` env vars (never committed). See `.env.example` for required keys.

## 6. Background Push Notifications (FCM)

Nooks delivers OS-level push notifications even when the app is closed, via Firebase Cloud Messaging (FCM). The system has three layers:

### A. Token Registration (Client)
`SettingsView` → `PushNotificationsCard` → `fcmService.requestPermissionAndSaveToken()`
1. User taps "Enable Push Notifications" in Settings (requires sign-in).
2. `Notification.requestPermission()` prompts the OS permission dialog.
3. On grant, `navigator.serviceWorker.ready` resolves the active SW registration, which is passed to `getToken(messaging, { vapidKey, serviceWorkerRegistration })` so Firebase uses our custom `/sw.js` rather than looking for the default `/firebase-messaging-sw.js`.
4. The token is stored at `users/{uid}/fcmTokens/{token}` in Firestore with `createdAt` and `platform` fields.
5. VAPID key is loaded from `VITE_FIREBASE_VAPID_KEY` (never committed; must be set in the deployment environment).
6. If permission is already `'granted'` on subsequent mounts (e.g. returning visits), token registration is retried automatically in the background — ensuring tokens are saved even if a previous attempt failed silently.

### B. Cloud Function Trigger (Server)
`functions/src/index.ts` — `onInboxCreated` (Firebase Cloud Functions v2, Node 20, `us-central1`)
- Fires on every new `users/{ownerUID}/inbox/{inboxId}` document.
- Reads all `users/{ownerUID}/fcmTokens` docs to collect the owner's registered tokens.
- Sends a **data-only multicast** via Admin SDK `messaging.sendEachForMulticast()`. No `notification` field — the SW handler controls display to prevent double-toasts when the app is in the foreground.
- Prunes tokens that FCM reports as invalid/unregistered.

### C. Service Worker Handler (Client)
`src/sw.ts` — uses `firebase/messaging/sw` (the SW-compatible variant of the client SDK).
- `onBackgroundMessage`: receives data-only pushes when the app is in the background/closed and calls `self.registration.showNotification()` to display an OS notification.
- `notificationclick`: closes the notification, focuses an existing app window or opens a new one at `?open=inbox`, so the user lands on the home view where the inbox nudge is shown.
- Firebase config is **hardcoded** in the SW (no `import.meta.env` in SW context); these are all public client-side values.
- App.tsx reads `?open=` on mount via a lazy `useState` initialiser and strips the param with `history.replaceState`.

### Notification Flow (End-to-End)
```
Contributor submits → Firestore inbox doc created
  → onInboxCreated Cloud Function fires
    → fetches owner's FCM tokens
    → sendEachForMulticast (data-only)
      → [app open]   NotificationProvider Sonner toast (PR 1)
      → [app closed] SW onBackgroundMessage → showNotification()
                       → user taps → notificationclick → ?open=inbox → HomeView
```

## 7. Data Export / Import (JSON)

Manual JSON backup flow — preserved for offline/legacy use:

- **Export**: `backupService.exportData()` serialises all Buckets and Tasks from the DB into a `NooksBackup` JSON object; `triggerDownload()` pushes it as a file download.
- **Import (Merge)**: Reads the uploaded JSON, validates the schema with `validateBackup()`, then calls `backupService.mergeData()` which strips IDs and deduplicates (buckets by case-insensitive name, tasks by `title::bucketName`). Unique items are added via `repository.addBucket/addTask`.
- **Import (Replace)**: Clears both tables (`db.buckets.clear()`, `db.tasks.clear()`) then seeds from the backup — prompts the user for a confirmation before executing.
- **Staleness Nudge**: `nudgeService.ts` emits a `backup-overdue` nudge when `lastExportDate` is `null` or ≥ 3 days old **and** `isSignedIn` is `false`. When signed in, cloud sync is considered an adequate backup, so the nudge is suppressed.
- **`localStorage` key**: `nooks_last_export` — stores ISO timestamp of last successful export.

## 8. Contributor Mode

Contributor Mode lets a trusted person (the contributor) submit tasks into the owner's inbox without having read access to the owner's full task list.

### App Mode (`localStorage`)
- `nooks_app_mode`: `'owner' | 'contributor'` — persists mode between sessions. Default: `'owner'`.
- `nooks_contributor_owner_uid`: ownerUID stored on the device after a successful invite redemption.
- `nooks_contributor_owner_email`: owner's email, stored alongside the UID for display.
- `nooks_dismissed_submissions`: JSON array of InboxItem IDs the contributor has soft-hidden. Items are hidden from the list but not deleted from Firestore; the contributor can reveal all via the "X hidden · Reveal" footer link.

### Data Isolation Guarantee
- The contributor **never** reads `users/{ownerUID}/tasks` or `users/{ownerUID}/buckets`.
- Inbox items live exclusively in `users/{ownerUID}/inbox/{inboxId}` in Firestore — they are **never written to IndexedDB**.
- Accepted inbox items are moved to the owner's local IndexedDB (via `repository.addTask`) only after the owner explicitly accepts them.
- The one narrowly scoped exception is `getAcceptedTaskStatus`: after acceptance, the contributor can read a **single** owner task document via a Firestore rule gated on `resource.data.contributorUID == request.auth.uid`. The task document's `contributorUID` field is set at acceptance time and is the access key — the contributor cannot enumerate or read any other tasks.

### Owner Review Flow
1. `HomeView` calls `getPendingInboxCount(user.uid)` on mount → passes count to `generateNudges`.
2. `inbox-pending` nudge click → `navigateToTasks('inbox')`.
3. `TasksView` with `initialStatusFilter === 'inbox'` fetches `fetchPendingInboxItems(user.uid)` from Firestore and renders `InboxItemRow` components.
4. **Accept**: `repository.addTask({ ..., contributorUID: item.contributorUID })` → `acceptInboxItem(ownerUID, inboxId, taskId)`. The `contributorUID` is stored on the task both in Dexie and Firestore so the contributor can later read its status.
5. **Decline**: `declineInboxItem(ownerUID, inboxId)`.

### Contributor Submit Flow
1. Contributor opens `ContributorHomeView`, clicks FAB.
2. Fills out a simplified form (title, urgency, importance, optional due date — no bucket, no status).
3. `submitInboxTask(ownerUID, item)` writes to `users/{ownerUID}/inbox`.
4. Submission is optimistically added to the contributor's local list with `status: 'pending'`.
5. Once the owner accepts, the pill shows the live task status (To Do / In Progress / Done ✓) fetched via `getAcceptedTaskStatus(ownerUID, taskId)`.
6. Contributor can **delete** any submission (all statuses) via `deleteInboxItem`. Non-pending submissions can also be **dismissed** (soft-hidden locally via localStorage) and later revealed via the "X hidden · Reveal" link.

### Invite Code Flow
1. Owner opens Settings → Sharing section → "Generate Invite" → `generateInviteCode(ownerUID, ownerEmail)` creates `invites/{code}` with a 7-day expiry.
2. Contributor switches to "Contributor" mode in Settings, enters code → `redeemInviteCode(code, contributorUID, contributorEmail)` validates expiry and redemption, writes `users/{contributorUID}/permissions/contributor`, stores ownerUID/email in `localStorage`.

## 9. Testing Philosophy
- **Unit Tests**: Located next to the source file (e.g., `nudgeService.test.ts`). Focus on pure logic.
- **Integration/View Tests**: Also located next to the source file (e.g., `HomeView.test.tsx`). Test rendered behaviour, user interactions, and navigation wiring using React Testing Library. `dexie-react-hooks`, `motion/react`, and `services/repository` are mocked so tests run without a real DB or animation engine.
- **Test Setup**: `src/tests/setup.ts` — provides a fresh `fake-indexeddb` instance before each test.
- **Factories**: `src/tests/factories.ts` — always use factories to generate mock data. Never hardcode objects in tests.
- **Coverage Target**: >85% overall, >80% for any modified file. All views (`App.tsx`, `HomeView`, `TasksView`, `CalendarView`) are covered at ≥90% statement coverage.

## 10. Maintenance Rules
- **Schema Changes**: If you update `db.ts` or the types in `db.ts`, you MUST update this document.
- **New Services**: If you add a file to `/services`, update the Business Logic Layer section above.
- **New Views**: If you add a view, update the Navigation & Views section above.
- **New Firestore Collections**: If you add a new subcollection, add a matching rule to `firestore.rules` and deploy with `firebase deploy --only firestore:rules`. Firestore denies all reads and writes by default — missing rules cause silent failures.
- **New Cloud Functions**: Deploy with `firebase deploy --only functions`. The runtime is Node 20 (`us-central1`); update `functions/package.json` `engines.node` if upgrading.
