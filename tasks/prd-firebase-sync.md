# PRD: Firebase Cloud Sync

## 1. Introduction / Overview

Currently, Nooks data lives exclusively in IndexedDB on the user's device. If the browser storage is cleared, the device is lost, or the user reinstalls, all tasks and buckets are permanently gone. The manual JSON export is the only safety net, but it requires the user to remember to do it — and surfaces a recurring "backup overdue" nudge that adds noise.

This feature replaces the backup nudge with automatic, silent cloud backup via Firebase. Every write to the local IndexedDB is mirrored to Firestore in the background. The user signs in once with email and password; from that point on, their data is safe without any manual action.

**Goal:** Give the user a reliable, invisible cloud backup so that no data is ever lost due to a device or storage failure — with zero ongoing effort required after initial sign-in.

---

## 2. Goals

1. All tasks and buckets are automatically synced to Firestore on every create, update, and delete.
2. The user can sign in with email and password from the Settings view.
3. On first sign-in, local data and any existing cloud data are merged (no data loss).
4. If the user is signed out and makes local changes, those changes are merged into the cloud on next sign-in.
5. The "backup overdue" nudge is removed from the Home screen for signed-in users.
6. The existing JSON export/import flow remains available in Settings for power users.
7. The app continues to work fully offline; sync happens when connectivity is restored.

---

## 3. User Stories

- **As a user**, I want to sign in with my email and password so that my data is backed up to the cloud.
- **As a user**, I want my tasks and buckets to sync automatically when I make changes, so I never have to think about backups.
- **As a user**, I want to sign out from the Settings view if I no longer want cloud sync active.
- **As a user**, I want the app to work normally when I'm offline, and sync my changes once I'm back online.
- **As a user**, I want to see my sync status (signed in as X / last synced) in the Settings view so I know my data is safe.
- **As a user**, I want the annoying backup nudge gone once my data is being backed up automatically.

---

## 4. Functional Requirements

### Authentication
1. The Settings view must display a "Sign in to back up" section when the user is not authenticated.
2. The sign-in form must accept email and password fields.
3. The system must use Firebase Authentication with the Email/Password provider.
4. A "Sign Out" button must be displayed when the user is signed in.
5. The user's display email must be shown in Settings when signed in (e.g. "Signed in as user@example.com").
6. Authentication state must persist across app restarts (Firebase handles this by default).
7. Sign-in errors (wrong password, user not found, etc.) must be shown inline below the form — not as alerts.
8. A "Create account" toggle must allow new users to register with email and password.

### Sync Behaviour
9. Every call to `repository.addTask`, `repository.updateTask`, `repository.deleteTask`, `repository.addBucket`, `repository.updateBucket`, and `repository.deleteBucket` must trigger a corresponding write to Firestore, **only if the user is signed in**.
10. Firestore data structure: each user's data lives under `users/{uid}/buckets/{bucketId}` and `users/{uid}/tasks/{taskId}`. The `{bucketId}` and `{taskId}` are string representations of the local Dexie auto-increment IDs.
11. Sync must be **fire-and-forget** from the UI perspective — the user should never be blocked waiting for a network response.
12. If the device is offline, sync writes must be queued by Firestore's built-in offline persistence and flushed automatically when connectivity is restored.
13. The Settings view must show a sync status indicator: "Last synced: [relative time]" or "Syncing…" when a write is in flight.

### First Sign-In Merge
14. When a user signs in for the first time on a device (or after being signed out), the system must perform a **merge** of local IndexedDB data and Firestore data using the same deduplication logic as `backupService.mergeData()` — buckets deduplicated by case-insensitive name, tasks by `title::bucketName`.
15. After the merge, Firestore must be updated to reflect the merged state.
16. The merge must happen silently in the background with a "Syncing your data…" status indicator — no modal or blocking UI.

### Nudge Suppression
17. The `backup-overdue` nudge must **not** be shown on the Home screen when the user is signed in to Firebase.
18. The nudge must continue to appear as normal when the user is not signed in.

### Sign-Out
19. Signing out must stop all future sync writes to Firestore.
20. Local IndexedDB data must be **preserved** on sign-out — the user's data is not cleared from the device.
21. After sign-out, the backup nudge resumes normal behaviour.

---

## 5. Non-Goals (Out of Scope)

- **Multi-device real-time sync**: This feature is cloud backup only. Real-time sync across two simultaneously open devices is not required.
- **Google / Apple Sign-In**: Only email/password auth in this version. The architecture should not block a future migration to OAuth providers.
- **End-to-end encryption**: Data will be stored in Firestore in plaintext (readable by Firebase). E2E encryption is a future consideration.
- **Conflict UI**: There is no conflict resolution UI — merge is always automatic and silent.
- **Removing JSON export/import**: The existing manual backup flow in Settings is kept as-is.
- **Push notifications**: Out of scope for this feature (tracked separately in POTENTIAL_PROJECTS.md).

---

## 6. Design Considerations

### Settings View changes
- **Signed out state**: Add a card below the existing export/import section with:
  - Heading: "Cloud Backup"
  - Subtext: "Sign in to automatically back up your nooks."
  - Email input, password input, Sign In button
  - "New here? Create an account" toggle to switch between sign-in and register modes
  - Inline error message area below the button
- **Signed in state**: Replace the sign-in form with:
  - "☁️ Backed up" or "☁️ Syncing…" status pill
  - "Signed in as user@example.com"
  - "Last synced: X minutes ago"
  - "Sign Out" button (secondary/ghost style)
- Keep the existing JSON export/import section unchanged — place the Cloud Backup card above it.

### Consistent with Nooks design language
- Use existing `Card`, `Button`, `Modal` primitives
- Warm, non-technical copy — "back up your nooks" not "sync to Firestore"
- No scary technical errors exposed to the user — map Firebase error codes to human-readable messages

---

## 7. Technical Considerations

### Firebase setup
- Install `firebase` npm package
- Create `src/services/firebaseService.ts` as the sole interface to Firebase — no direct Firebase SDK calls from views or repository
- Firebase config (API key, project ID, etc.) must be stored in `.env` as `VITE_FIREBASE_*` variables, never hardcoded
- Enable Firestore offline persistence (`enableIndexedDbPersistence`) so writes queue when offline

### Sync integration point
- The cleanest integration is a thin wrapper inside `repository.ts` — after every successful local Dexie write, call the corresponding `firebaseService` method
- Alternatively, a `syncService.ts` can sit between the repository and Firebase — preferred if we want to keep `repository.ts` focused on local DB only
- Either way, sync is **additive** — if Firebase is unreachable or the user is signed out, the local write still succeeds normally

### Auth state
- Use a reactive auth state listener (`onAuthStateChanged`) initialised in `App.tsx` or a new `useAuth` hook
- Auth state should be stored in React context so Settings and the nudge suppression logic can both read it without prop drilling

### Merge on sign-in
- On `onAuthStateChanged` firing with a non-null user, fetch all Firestore documents for that UID, run them through the same merge logic as `backupService.mergeData()`, write merged result back to both IndexedDB and Firestore

### Data model mapping
- Dexie auto-increment IDs are device-local integers. In Firestore, use the string form of the local ID as the document ID for simplicity in this single-device version
- Each Firestore document mirrors the local TypeScript interface (`Task` / `Bucket`) with Dates serialised as Firestore Timestamps

### ARCHITECTURE.md must be updated to reflect:
- New `firebaseService.ts` in the Business Logic Layer section
- Updated Data Flow diagram (local writes → repository → Firestore)
- New Auth state management pattern
- Nudge suppression condition change

---

## 8. Documentation Maintenance

The following docs **must** be updated as part of this feature's implementation:

| Document | What to update |
|---|---|
| `ARCHITECTURE.md` | Add `firebaseService.ts` to §2B; update §1 data flow; add auth state pattern; update nudge suppression note in §5 |
| `POTENTIAL_PROJECTS.md` | Mark Project #1 (Firebase Cloud Sync) as complete once shipped |

---

## 9. Success Metrics

- User can sign in and sign out without errors
- Every local write (add/update/delete for tasks and buckets) produces a corresponding Firestore document change within 5 seconds on a normal connection
- First sign-in merge produces no data loss (all local + cloud items present after merge)
- App works fully offline and syncs on reconnect
- "Backup overdue" nudge does not appear when signed in
- All existing tests continue to pass; new `firebaseService.ts` has unit test coverage ≥ 80%

---

## 10. Open Questions

- None — all key decisions resolved in pre-PRD discussion.
