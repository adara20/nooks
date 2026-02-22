# Tasks: Data Export & Import (JSON Backup)

## Relevant Files

- `src/services/backupService.ts` - New service: pure functions for export, import, validation, and merge logic.
- `src/services/backupService.test.ts` - Unit tests for all backup service functions.
- `src/services/nudgeService.ts` - Updated to accept `lastExportDate` parameter and generate backup-overdue nudge.
- `src/services/nudgeService.test.ts` - Updated tests covering new backup nudge logic.
- `src/views/SettingsView.tsx` - New Settings view with export/import controls and last backup indicator.
- `src/views/SettingsView.test.tsx` - Unit tests for SettingsView.
- `src/views/HomeView.tsx` - Updated to pass `lastExportDate` to nudge generator and render settings gear icon.
- `src/components/BottomNav.tsx` - No change needed (Settings accessed via icon, not tab).
- `src/App.tsx` - Updated to handle `settings` view navigation.
- `ARCHITECTURE.md` - Updated to document new service and view.

### Notes

- Unit tests should be alongside the code files.
- Use `npm test` to run tests and `npm run test:coverage` for coverage report.
- Target: >85% overall, >80% for all modified files.

---

## Instructions for Completing Tasks

**IMPORTANT:** Change `- [ ]` to `- [x]` as you complete tasks.

**Mandatory Workflow Rules:**
1. **Feature Isolation:** Ensure new features do not break existing functionality. Verify by running the full test suite before and after each change.
2. **Continuous Verification:** Run ALL unit tests after completing each sub-task. Fix any failure before proceeding.
3. **Zero-Threshold Verification:** Every code modification MUST be followed by `npm run lint` and a test run.
4. **Extensive Testing:** For every new function or logic branch, write tests covering success cases, edge cases, and failure cases.
5. **Git Safety:** Never push to remote without explicit user confirmation.
6. **Local Commits:** Commit locally after each verified parent task.

---

## Tasks

- [ ] 0.0 Create feature branch
  - [ ] 0.1 Run `git checkout -b feature/data-export-import`
  - [ ] 0.2 Run `npm test` to confirm all 62 existing tests pass before touching anything.

- [ ] 1.0 Build `backupService.ts` — export, import, validation, and merge logic
  - [ ] 1.1 Create `src/services/backupService.ts` with the following pure functions:
    - `exportData(buckets, tasks): string` — serialises to JSON string with `version: 1` and `exportedAt` timestamp
    - `triggerDownload(jsonString: string, filename: string): void` — creates a Blob and triggers browser download
    - `validateBackup(parsed: unknown): parsed is NooksBackup` — type guard that checks for `version` field and expected shape
    - `mergeData(existing: {buckets, tasks}, incoming: {buckets, tasks}): {buckets, tasks}` — merges, skipping duplicates (bucket: same name case-insensitive; task: same title + same resolved bucketId)
    - `getLastExportDate(): Date | null` — reads `nooks_last_export` from localStorage, returns Date or null
    - `setLastExportDate(): void` — writes current timestamp to `nooks_last_export` in localStorage
  - [ ] 1.2 Define and export the `NooksBackup` TypeScript interface in `backupService.ts`:
    ```ts
    interface NooksBackup {
      version: number;
      exportedAt: string;
      buckets: Bucket[];
      tasks: Task[];
    }
    ```
  - [ ] 1.3 Write extensive unit tests in `src/services/backupService.test.ts`:
    - `exportData` produces valid JSON with correct shape, version, and exportedAt
    - `validateBackup` returns true for valid backup, false for missing version, false for missing buckets/tasks, false for non-object input
    - `mergeData` adds new buckets and tasks
    - `mergeData` skips duplicate buckets (case-insensitive name match)
    - `mergeData` skips duplicate tasks (same title + same bucket)
    - `mergeData` does not mutate existing data
    - `getLastExportDate` returns null when localStorage key is absent
    - `getLastExportDate` returns a Date when key is present
    - `setLastExportDate` writes an ISO string to localStorage
  - [ ] 1.4 **Verify & Test:** Run `npm test` and `npm run lint`. All tests must pass, no type errors.
  - [ ] 1.5 **Human Review:** Confirm task 1 is complete before proceeding.
  - [ ] 1.6 **Local Commit:** `git commit -m "feat: add backupService with export, import, validation, and merge logic"`

- [ ] 2.0 Update `nudgeService.ts` to include backup-overdue nudge
  - [ ] 2.1 Update the `generateNudges` function signature to accept an optional second parameter: `lastExportDate: Date | null`
  - [ ] 2.2 Add logic: if `lastExportDate` is null OR is more than 3 days ago, push a new nudge:
    - `id: 'backup-overdue'`
    - `type: 'gentle'`
    - Message examples: `"No backup yet. Tap to save a copy of your nooks."` or `"Your last backup was X days ago. Worth saving a fresh copy."`
  - [ ] 2.3 Update `nudgeService.test.ts` with new tests:
    - Backup nudge appears when `lastExportDate` is null
    - Backup nudge appears when `lastExportDate` is 3 days ago
    - Backup nudge appears when `lastExportDate` is more than 3 days ago
    - Backup nudge does NOT appear when `lastExportDate` is less than 3 days ago
    - Existing tests still pass (existing call sites pass `null` as default)
  - [ ] 2.4 **Verify & Test:** Run `npm test` and `npm run lint`. All tests must pass.
  - [ ] 2.5 **Human Review:** Confirm task 2 is complete before proceeding.
  - [ ] 2.6 **Local Commit:** `git commit -m "feat: add backup-overdue nudge to nudgeService"`

- [ ] 3.0 Build `SettingsView.tsx`
  - [ ] 3.1 Create `src/views/SettingsView.tsx` with:
    - A header "Settings" with a back/close button that returns to Home
    - A "Last backup" indicator: reads `getLastExportDate()` on mount, displays "No backup yet" or "Last backup: X days ago" (use `date-fns/formatDistanceToNow`)
    - The indicator text should be orange/amber tinted when backup is 3+ days stale, neutral otherwise
    - An **"Export Data"** button that: calls `repository.getAllBuckets()` and `repository.getAllTasks()`, calls `exportData()`, calls `triggerDownload()`, then calls `setLastExportDate()` and refreshes the indicator
    - An **"Import Data"** button that: programmatically clicks a hidden `<input type="file" accept=".json">`, reads the file, calls `validateBackup()` (show error toast/message if invalid), then shows a choice modal
  - [ ] 3.2 Build the **choice modal** (can reuse existing `Modal` component):
    - Title: "Import Backup"
    - Body: "What would you like to do with your existing data?"
    - Button 1: **"Replace everything"** — on confirm, show a second confirmation ("This will delete all current data. Are you sure?"), then call `db.buckets.clear()`, `db.tasks.clear()`, then write all imported data via `repository`
    - Button 2: **"Merge"** — calls `mergeData()` with existing + incoming data, then writes only new items via `repository`
    - Button 3: **"Cancel"** — closes modal, no changes
  - [ ] 3.3 Write unit tests in `src/views/SettingsView.test.tsx`:
    - Renders "No backup yet" when localStorage has no export date
    - Renders "Last backup" text when localStorage has a recent export date
    - Export button triggers a download (mock `triggerDownload`)
    - Import button opens file picker (mock file input click)
    - Invalid file shows error message
  - [ ] 3.4 **Verify & Test:** Run `npm test` and `npm run lint`. All tests pass.
  - [ ] 3.5 **Human Review:** Confirm task 3 is complete before proceeding.
  - [ ] 3.6 **Local Commit:** `git commit -m "feat: add SettingsView with export and import UI"`

- [ ] 4.0 Wire Settings into App navigation and update HomeView
  - [ ] 4.1 Add `'settings'` to the `TabType` union in `App.tsx` (or handle as an overlay — whichever is cleaner given the existing nav structure)
  - [ ] 4.2 Add a gear icon (use `Settings` from `lucide-react`) to the `HomeView` header that navigates to Settings
  - [ ] 4.3 Update `HomeView` to call `generateNudges(tasks, getLastExportDate())` so the backup-overdue nudge is passed through
  - [ ] 4.4 When the backup-overdue nudge card is tapped on Home, navigate to Settings
  - [ ] 4.5 **Verify & Test:** Run `npm test` and `npm run lint`. All tests pass.
  - [ ] 4.6 **Human Review:** Confirm task 4 is complete before proceeding.
  - [ ] 4.7 **Local Commit:** `git commit -m "feat: wire Settings into App nav and connect backup nudge to HomeView"`

- [ ] 5.0 Finalise & Cleanup
  - [ ] 5.1 **Architecture Sync:** Update `ARCHITECTURE.md` — add `backupService.ts` to the Business Logic Layer section, add `SettingsView.tsx` to the View Layer section, document the `localStorage` key `nooks_last_export`
  - [ ] 5.2 Run `npm run test:coverage` — confirm >85% overall and >80% for all modified/new files
  - [ ] 5.3 **Human Review:** Ask user to do a manual smoke test: export → clear data → import → verify data is restored
  - [ ] 5.4 **PR Request:** Ask the user if a PR should be created.
  - [ ] 5.5 **Push:** Push the local branch to remote upon approval.
  - [ ] 5.6 **Cleanup:** Once PR is merged, delete local and remote branches, remove `tasks/prd-data-export-import.md` and `tasks/tasks-data-export-import.md`.
