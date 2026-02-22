# PRD: Data Export & Import (JSON Backup)

## 1. Introduction / Overview

Nooks is a local-first app. All data lives in IndexedDB on the user's device, which means iOS Safari can evict it under storage pressure, and there is no automatic cloud backup in v1. This feature gives the user a reliable, one-tap way to export their full data as a JSON file and restore it at any time. It also surfaces a persistent backup indicator and an escalating nudge to remind the user to back up regularly.

**Goal:** Protect against data loss with zero friction, and make the user aware of how stale their last backup is.

---

## 2. Goals

- Allow the user to export all app data (buckets + all tasks, including completed) as a single JSON file at any time.
- Allow the user to import a previously exported JSON file to restore or merge data.
- Show a persistent "last backup" indicator on the Settings page.
- Show an escalating nudge card on the Home screen when no backup has been taken in 3+ days.

---

## 3. User Stories

- As a user, I want to tap a button and download my data as a JSON file so that I have a backup I can restore from.
- As a user, I want to import a JSON backup file so that I can restore my data after a loss or a device change.
- As a user, I want to be told when my last backup was, so I know how much data I'd lose if something went wrong.
- As a user, I want to be nudged when my backup is getting stale, so I don't forget to export.
- As a user, when I import data and some already exists, I want to choose between replacing everything or merging, so I don't accidentally lose data in either direction.
- As a user, when merging, I want duplicate items to be skipped automatically so the merge is clean.

---

## 4. Functional Requirements

1. A **Settings page** must be created, accessible via a gear icon on the Home screen header.
2. The Settings page must have an **"Export Data"** button that, when tapped, triggers a download of a JSON file named `nooks-backup-YYYY-MM-DD.json`.
3. The exported JSON must include:
   - All buckets (all fields)
   - All tasks (all fields, all statuses including `done`)
   - A `exportedAt` timestamp
   - A `version` field (set to `1`) for future migration compatibility
4. The Settings page must have an **"Import Data"** button that opens a file picker accepting `.json` files only.
5. On import, the app must validate the file is a valid Nooks backup (checks for `version` field and expected shape). If invalid, show a clear error message and abort.
6. On import, if data already exists in the app, the user must be shown a **choice modal** with two options:
   - **Replace** — wipe all current data and restore from the file
   - **Merge** — add imported buckets and tasks that don't already exist, skip duplicates
7. **Duplicate detection for merge:**
   - Buckets: duplicate = same `name` (case-insensitive)
   - Tasks: duplicate = same `title` + same `bucketId` (matched by name after bucket merge)
8. The Settings page must display a **"Last backup"** indicator showing how long ago the last export was (e.g., "Last backup: 2 days ago"). If no backup has ever been taken, show "No backup yet."
9. The timestamp of the last export must be stored in `localStorage` (key: `nooks_last_export`) so it persists across sessions.
10. The **Home screen** must show a nudge card when the last backup was 3 or more days ago (or never). The nudge must link/navigate to the Settings page.
11. The nudge message should be warm and slightly urgent in tone, consistent with the app's personality (e.g., "Your last backup was 5 days ago. Tap to save a copy before it slips away.").

---

## 5. Non-Goals (Out of Scope)

- Automatic/scheduled backups — this is manual only in v1.
- Cloud storage integration (iCloud, Google Drive) — future feature.
- Encrypting the JSON file — the export is plaintext JSON.
- Importing from other task apps or formats — only Nooks JSON backups are supported.

---

## 6. Design Considerations

- The Settings page should follow the existing warm/playful design system.
- The "Last backup" indicator should be subtle when recent, and more prominent (orange/red tint) when stale.
- The choice modal (Replace vs Merge) must be clear and not alarming — use friendly language, not destructive-sounding copy.
- The Replace option must require a single explicit confirmation tap before wiping data.

---

## 7. Technical Considerations

- Export: use `JSON.stringify` + a `Blob` + a dynamically created `<a>` element with `download` attribute. No libraries needed.
- Import: use an `<input type="file" accept=".json">` element triggered programmatically.
- Last export timestamp: stored in `localStorage` as an ISO string under key `nooks_last_export`. Updated every time an export succeeds.
- The nudge logic for "backup overdue" should live in `nudgeService.ts` as a pure function, taking the `lastExportDate` (or `null`) as a parameter alongside the task list.
- The Settings page lives at `src/views/SettingsView.tsx`.
- A new `src/services/backupService.ts` handles the export/import logic as pure functions (no direct UI concerns).
- `ARCHITECTURE.md` must be updated to document the new service and the Settings view.

---

## 8. Documentation Maintenance

This feature adds:
- `src/views/SettingsView.tsx` — new view
- `src/services/backupService.ts` — new service

`ARCHITECTURE.md` must be updated to reflect both additions.

---

## 9. Success Metrics

- User can export data and re-import it with all buckets and tasks fully restored.
- Merge correctly skips exact duplicates and adds genuinely new items.
- Backup nudge appears on Home after 3 days without export and links to Settings.
- No data loss occurs during Replace or Merge operations.

---

## 10. Open Questions

- None — all decisions locked in.
