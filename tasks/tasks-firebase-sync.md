# Tasks: Firebase Cloud Sync

## Relevant Files

### New files
- `src/services/firebaseService.ts` - Sole interface to Firebase SDK. Initialises app, exports `auth`, `db` (Firestore), and all auth/sync helper functions.
- `src/services/firebaseService.test.ts` - Unit tests for sync and merge logic (Firebase SDK mocked).
- `src/context/AuthContext.tsx` - React context that wraps `onAuthStateChanged` and exposes `user`, `isSignedIn`, `signIn`, `signUp`, `signOut`.
- `src/context/AuthContext.test.tsx` - Unit tests for auth context behaviour.
- `.env` - ⚠️ **Never committed.** Holds `VITE_FIREBASE_*` config values. Created manually at Task 1.
- `.env.example` - Committed placeholder showing required variable names with empty values.

### Modified files
- `src/services/repository.ts` - Each write method calls the corresponding `firebaseService` sync function after the local Dexie write succeeds.
- `src/services/repository.test.ts` - Extend with tests verifying sync is called (and gracefully skipped when signed out).
- `src/services/nudgeService.ts` - `generateNudges` accepts an optional `isSignedIn` boolean; suppresses `backup-overdue` nudge when `true`.
- `src/services/nudgeService.test.ts` - Extend with tests for nudge suppression when signed in.
- `src/views/SettingsView.tsx` - Add Cloud Backup card above the existing JSON export/import section.
- `src/views/SettingsView.test.tsx` - New test file covering signed-out form, signed-in status, and sign-out button.
- `src/views/HomeView.tsx` - Pass `isSignedIn` from auth context into `generateNudges`.
- `src/views/HomeView.test.tsx` - Extend with tests for nudge suppression.
- `src/App.tsx` - Wrap app in `AuthProvider`; pass auth state down as needed.
- `src/App.test.tsx` - Extend with test confirming `AuthProvider` is present in the tree.
- `ARCHITECTURE.md` - Update §1 data flow, §2B services, add §X auth state pattern, update §5 nudge suppression note.

### Notes
- Firebase SDK is mocked in all tests — no real network calls are made.
- Use `npm test` to run the full suite after every sub-task.
- Use `npx tsc --noEmit` after every sub-task for type safety.
- `.env` is in `.gitignore` — never stage or commit it.

---

## Instructions for Completing Tasks

**IMPORTANT:** Change `- [ ]` to `- [x]` as you complete tasks.

**Mandatory Workflow Rules:**
1. **Feature Isolation:** New features must not break existing functionality. Run the full test suite before and after every change.
2. **Continuous Verification:** Run ALL unit tests after every sub-task. Fix any failure before proceeding.
3. **Zero-Threshold Verification:** Every code modification must be followed by `npx tsc --noEmit` and a test run.
4. **Extensive Testing:** Write tests for every new service function, context value, and UI branch.
5. **Git Safety:** Never push to remote without explicit user confirmation. Work on the feature branch only.
6. **Local Commits:** Commit locally after each parent task is verified and approved.

---

## Tasks

- [ ] 0.0 **Create feature branch**
  - [ ] 0.1 Run `git checkout -b feature/firebase-sync` from `main`.
  - [ ] 0.2 Confirm branch is active with `git branch`.

---

- [ ] 1.0 **Firebase project setup & environment config** ⛔ STOP — requires Firebase credentials from user
  - [ ] 1.1 Install the Firebase SDK: `npm install firebase`.
  - [ ] 1.2 **⛔ HARD STOP — credential handoff:**
    - Ask the user: *"Please share your Firebase project config object. I'll write the values directly to `.env` and they will not appear in any committed file. You can find it in the Firebase console under Project Settings → Your apps → SDK setup and configuration."*
    - Wait for the user to provide the config values.
    - Write `.env` directly using the values provided — **do not echo them back into the conversation**.
    - The required variables are:
      ```
      VITE_FIREBASE_API_KEY=
      VITE_FIREBASE_AUTH_DOMAIN=
      VITE_FIREBASE_PROJECT_ID=
      VITE_FIREBASE_STORAGE_BUCKET=
      VITE_FIREBASE_MESSAGING_SENDER_ID=
      VITE_FIREBASE_APP_ID=
      ```
  - [ ] 1.3 Create `.env.example` with the same variable names but **empty values** and commit it so future developers know what's needed.
  - [ ] 1.4 Enable **Email/Password** sign-in provider in the Firebase console Authentication settings. Confirm with the user that this is done before proceeding.
  - [ ] 1.5 Enable **Firestore** in the Firebase console (start in **production mode**). Confirm with the user.
  - [ ] 1.6 Set Firestore security rules to allow read/write only for authenticated users:
      ```
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /users/{userId}/{document=**} {
            allow read, write: if request.auth != null && request.auth.uid == userId;
          }
        }
      }
      ```
      Confirm with the user that the rules are published.
  - [ ] 1.7 Create `src/services/firebaseService.ts` — initialises Firebase app from `import.meta.env.VITE_FIREBASE_*` variables, exports `auth` and `firestore` instances. No sync logic yet — just initialisation.
  - [ ] 1.8 Verify: `npx tsc --noEmit` passes. `npm run dev` loads without console errors.
  - [ ] 1.9 **Human Review:** Confirm Firebase console shows the app connected (check Project Settings → Your apps for last activity). Ask user for permission to proceed.
  - [ ] 1.10 **Local Commit:** `chore: add Firebase SDK and environment config scaffold`

---

- [ ] 2.0 **Auth service & React context**
  - [ ] 2.1 Add auth functions to `firebaseService.ts`:
    - `signInWithEmail(email, password)` — wraps `signInWithEmailAndPassword`
    - `signUpWithEmail(email, password)` — wraps `createUserWithEmailAndPassword`
    - `signOutUser()` — wraps `signOut`
    - Export the `auth` instance for use in the context
  - [ ] 2.2 Create `src/context/AuthContext.tsx`:
    - `AuthProvider` component that calls `onAuthStateChanged` on mount
    - Exposes via context: `user` (Firebase `User | null`), `isSignedIn` (boolean), `signIn`, `signUp`, `signOut`, `authLoading` (true until first auth state resolves)
  - [ ] 2.3 Wrap `<App />` in `<AuthProvider>` in `src/main.tsx`.
  - [ ] 2.4 Update `src/App.tsx` to read `authLoading` from context — keep showing the existing "Finding your nooks…" loading state until both `dbReady` and `!authLoading` are true.
  - [ ] 2.5 Write tests for `AuthContext.test.tsx`:
    - Mock `firebase/auth` module
    - `authLoading` is `true` before `onAuthStateChanged` fires, `false` after
    - `isSignedIn` is `false` when user is `null`, `true` when user is present
    - `signIn` calls `signInWithEmailAndPassword` with correct args
    - `signUp` calls `createUserWithEmailAndPassword` with correct args
    - `signOut` calls the Firebase `signOut` function
  - [ ] 2.6 Write tests for auth functions in `firebaseService.test.ts` (mock Firebase SDK).
  - [ ] 2.7 **Verify & Test:** `npm test` — all 205 existing tests still pass, new auth tests pass. `npx tsc --noEmit` clean.
  - [ ] 2.8 **Human Review:** Ask user if Task 2.0 is complete and for permission to proceed.
  - [ ] 2.9 **Local Commit:** `feat: add Firebase auth service and AuthContext`

---

- [ ] 3.0 **Firestore sync service**
  - [ ] 3.1 Add sync functions to `firebaseService.ts` — each function is a no-op (returns immediately) if `auth.currentUser` is `null`:
    - `syncUpsertTask(task: Task)` — writes/overwrites `users/{uid}/tasks/{task.id}` in Firestore. Serialises `Date` fields to Firestore `Timestamp`.
    - `syncDeleteTask(taskId: number)` — deletes `users/{uid}/tasks/{taskId}`.
    - `syncUpsertBucket(bucket: Bucket)` — writes/overwrites `users/{uid}/buckets/{bucket.id}`.
    - `syncDeleteBucket(bucketId: number)` — deletes `users/{uid}/buckets/{bucketId}`.
  - [ ] 3.2 Enable Firestore offline persistence in `firebaseService.ts` initialisation: call `enableIndexedDbPersistence(firestore)` (wrapped in a try/catch — it throws if called more than once, e.g. in tests).
  - [ ] 3.3 Update `src/services/repository.ts` — after each successful local Dexie write, call the corresponding sync function. Pattern for every method:
    ```ts
    async addTask(data) {
      const id = await db.tasks.add({ ...data, createdAt: new Date() });
      const task = await db.tasks.get(id);
      await syncUpsertTask(task!);   // fire-and-forget: errors are caught and logged, never thrown
      return id;
    }
    ```
    Wrap all sync calls in `try/catch` — a Firebase error must never crash a local write.
  - [ ] 3.4 Write tests in `firebaseService.test.ts`:
    - `syncUpsertTask` is a no-op when `auth.currentUser` is `null`
    - `syncUpsertTask` calls Firestore `setDoc` with correct path and serialised data when signed in
    - `syncDeleteTask` calls Firestore `deleteDoc` with correct path
    - Same for bucket sync functions
    - Date fields are serialised to Firestore Timestamps (not raw JS Date objects)
  - [ ] 3.5 Write tests in `repository.test.ts`:
    - `addTask` calls `syncUpsertTask` after local write
    - `updateTask` calls `syncUpsertTask` after local write
    - `deleteTask` calls `syncDeleteTask` after local write
    - Sync failure (mocked rejection) does NOT throw or prevent the local write from completing
    - Same coverage for bucket methods
  - [ ] 3.6 **Verify & Test:** `npm test` — all tests pass. `npx tsc --noEmit` clean.
  - [ ] 3.7 **Human Review:** Ask user if Task 3.0 is complete and for permission to proceed.
  - [ ] 3.8 **Local Commit:** `feat: add Firestore sync to repository write methods`

---

- [ ] 4.0 **First sign-in merge**
  - [ ] 4.1 Add `fetchCloudData(uid: string)` to `firebaseService.ts` — fetches all documents from `users/{uid}/tasks` and `users/{uid}/buckets` and returns them as `{ tasks: Task[], buckets: Bucket[] }`. Converts Firestore Timestamps back to JS `Date` objects.
  - [ ] 4.2 Add `pushAllToCloud(uid: string, tasks: Task[], buckets: Bucket[])` to `firebaseService.ts` — batch-writes all local tasks and buckets to Firestore (used after merge to bring cloud in sync).
  - [ ] 4.3 Add a `runInitialSync(uid: string)` function (can live in `firebaseService.ts` or a new `syncService.ts`):
    1. Fetch all cloud data via `fetchCloudData`
    2. Fetch all local data via `repository.getAllTasks()` and `repository.getAllBuckets()`
    3. Run `backupService.mergeData()` — pass cloud data as the "backup" and local data as the current state. The merge deduplicates and returns the union.
    4. Write merged buckets and tasks back to local IndexedDB (clear + re-seed from merged result, same as Import Replace flow)
    5. Push the full merged state to Firestore via `pushAllToCloud`
  - [ ] 4.4 Call `runInitialSync(uid)` inside `AuthContext` when `onAuthStateChanged` fires with a non-null user for the first time in the session. Track `syncStatus: 'idle' | 'syncing' | 'synced' | 'error'` in context.
  - [ ] 4.5 Write tests for `fetchCloudData`:
    - Returns empty arrays when no documents exist
    - Correctly deserialises Firestore Timestamps to JS Dates
  - [ ] 4.6 Write tests for `runInitialSync`:
    - Calls `mergeData` with cloud + local data
    - Writes merged result to IndexedDB
    - Pushes merged result back to Firestore
    - Sets `syncStatus` to `'syncing'` during execution and `'synced'` on success
    - Sets `syncStatus` to `'error'` on Firestore failure without crashing the app
  - [ ] 4.7 **Verify & Test:** `npm test` — all tests pass. `npx tsc --noEmit` clean.
  - [ ] 4.8 **Human Review:** Ask user if Task 4.0 is complete and for permission to proceed.
  - [ ] 4.9 **Local Commit:** `feat: run merge sync on first sign-in`

---

- [ ] 5.0 **Settings UI — Cloud Backup card**
  - [ ] 5.1 Update `src/views/SettingsView.tsx` — add a "Cloud Backup" card **above** the existing JSON export section. The card has two states:

    **Signed out state:**
    - Heading: "Cloud Backup"
    - Subtext: "Sign in to automatically back up your nooks."
    - Toggle between "Sign In" and "Create Account" modes (single `isRegistering` boolean state)
    - Email input (`type="email"`) and password input (`type="password"`)
    - Primary action button: "Sign In" or "Create Account"
    - Inline error message below the button (map Firebase error codes to human-readable strings — see note below)
    - Loading state on the button while the auth request is in flight

    **Signed in state:**
    - Status pill: "☁️ Syncing…" (when `syncStatus === 'syncing'`) or "☁️ Backed up" (when `synced`)
    - "Signed in as {user.email}"
    - "Last synced: just now" (or relative time — use `date-fns/formatDistanceToNow`)
    - "Sign Out" ghost button

  - [ ] 5.2 Human-readable Firebase error map (inline in `SettingsView` or a small helper):
    - `auth/user-not-found` → "No account found with that email."
    - `auth/wrong-password` → "Incorrect password."
    - `auth/email-already-in-use` → "An account with this email already exists."
    - `auth/weak-password` → "Password must be at least 6 characters."
    - `auth/invalid-email` → "Please enter a valid email address."
    - Fallback → "Something went wrong. Please try again."
  - [ ] 5.3 Create `src/views/SettingsView.test.tsx`:
    - Signed-out state renders email/password inputs and Sign In button
    - Toggle to "Create Account" mode shows correct button label
    - Submitting sign-in calls `signIn` from context with correct args
    - Firebase error renders correct human-readable message inline
    - Loading state disables the button during auth request
    - Signed-in state renders email, "Backed up" pill, and Sign Out button
    - Clicking Sign Out calls `signOut` from context
    - Existing JSON export/import section is still present in both states
  - [ ] 5.4 **Verify & Test:** `npm test` — all tests pass. `npx tsc --noEmit` clean.
  - [ ] 5.5 **Human Review:** Ask user to visually test sign-in and sign-out flows in the running app. Ask for permission to proceed.
  - [ ] 5.6 **Local Commit:** `feat: add Cloud Backup card to SettingsView`

---

- [ ] 6.0 **Nudge suppression**
  - [ ] 6.1 Update `generateNudges` signature in `src/services/nudgeService.ts`:
    ```ts
    generateNudges(tasks: Task[], lastExportDate: string | null, isSignedIn: boolean = false): Nudge[]
    ```
    When `isSignedIn` is `true`, skip the `backup-overdue` nudge entirely.
  - [ ] 6.2 Update `src/views/HomeView.tsx` — read `isSignedIn` from `AuthContext` and pass it as the third argument to `generateNudges`.
  - [ ] 6.3 Update `src/services/nudgeService.test.ts`:
    - `backup-overdue` nudge is NOT returned when `isSignedIn` is `true`, regardless of `lastExportDate`
    - `backup-overdue` nudge IS returned as normal when `isSignedIn` is `false` (existing tests must still pass)
  - [ ] 6.4 Update `src/views/HomeView.test.tsx`:
    - Add test: backup nudge does not appear when `isSignedIn` is `true`
    - Add test: backup nudge appears when `isSignedIn` is `false` and backup is overdue
  - [ ] 6.5 **Verify & Test:** `npm test` — all tests pass. `npx tsc --noEmit` clean.
  - [ ] 6.6 **Human Review:** Ask user if Task 6.0 is complete and for permission to proceed.
  - [ ] 6.7 **Local Commit:** `feat: suppress backup-overdue nudge when user is signed in`

---

- [ ] 7.0 **Finalize & cleanup**
  - [ ] 7.1 **Coverage check:** Run `npm run test:coverage`. Confirm:
    - Overall coverage ≥ 85%
    - `firebaseService.ts` ≥ 80%
    - `AuthContext.tsx` ≥ 80%
    - All modified files ≥ 80%
    - Address any gaps before proceeding.
  - [ ] 7.2 **Architecture sync:** Update `ARCHITECTURE.md`:
    - §1 — update data flow: `Views → Repository → Dexie/IndexedDB` **and** `Repository → firebaseService → Firestore`
    - §2B — add `firebaseService.ts` entry describing its role
    - Add new §X "Auth State" describing `AuthContext`, `onAuthStateChanged`, and `authLoading`
    - §5 — update nudge suppression note: "suppressed when `isSignedIn` is `true`"
    - §7 Maintenance Rules — add: "If Firebase config variables change, update `.env.example`"
  - [ ] 7.3 **Final test run:** `npm test` — all tests pass with zero failures.
  - [ ] 7.4 **Human Review:** Full manual smoke test — sign up, add a task, check Firestore console to confirm document appears, sign out, sign back in, confirm data is intact.
  - [ ] 7.5 **PR Request:** Ask the user if a PR should be created.
  - [ ] 7.6 **Push:** Push the feature branch to remote: `git push -u origin feature/firebase-sync`.
  - [ ] 7.7 **Cleanup:** Once the user confirms the PR is merged:
    - `git checkout main && git pull`
    - `git branch -d feature/firebase-sync`
    - `git push origin --delete feature/firebase-sync`
    - Remove `tasks/prd-firebase-sync.md` and `tasks/tasks-firebase-sync.md`
    - Update `POTENTIAL_PROJECTS.md` — mark Project #1 as complete
