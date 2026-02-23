# Nooks: Potential Projects

This document tracks high-level feature ideas and architectural improvements for Nooks. Add new ideas here as they arise.

---

## 1. Firebase Cloud Sync
**Problem:** Data is currently local-only (IndexedDB). If the user clears browser storage or switches devices, data is lost.
**Solution:** Add Firebase Auth + encrypted cloud sync as a backup/restore mechanism.
- **Details:** End-to-end encrypt data on device before sending to Firebase. User authenticates with email. Data is never readable by the server.
- **Value:** Peace of mind for personal data without sacrificing privacy.

## 2. Prescription / Date-Calculated Reminders
**Problem:** Some tasks (like prescription pickup) have a calculated due date based on a known pickup cycle.
**Solution:** A special task type or field that calculates a due date from a start date + interval.
- **Details:** User sets a "pickup date" and a "refill cycle" (e.g., 30 days). App calculates next due date automatically and surfaces it in the Calendar view.
- **Value:** Removes mental load for recurring, date-sensitive errands.

## 3. Mid-Tier Hierarchy (Projects)
**Problem:** Some things are too big for a single task but belong inside a Bucket (e.g., "Learn Spanish" inside a "Learning" bucket).
**Solution:** Add an optional middle tier between Bucket and Task — a "Project" or creatively named container.
- **Details:** Projects live inside a Bucket, tasks live inside Projects. Projects are never "done." Bucket → Project → Task hierarchy.
- **Value:** Better organization for complex, long-running initiatives.

## 4. In-Progress Overload Warning
**Problem:** Users might start many tasks without finishing them, leading to paralysis.
**Solution:** A nudge that fires when the number of in-progress tasks exceeds a threshold.
- **Details:** If `in-progress` count > N (configurable, default 5), show a warning nudge: "You've got X things in flight. Maybe land one before taking off again?"
- **Value:** Enforces focus and promotes task completion over task starting.

## 5. Drag-and-Drop Quadrant Placement
**Problem:** Assigning urgency/importance via toggles is functional but not as intuitive as visual placement.
**Solution:** Allow users to drag tasks directly into quadrants in the Quadrant view.
- **Details:** Replace or augment the yes/no toggle UI with drag-and-drop in the 2x2 grid.
- **Value:** More intuitive prioritization workflow for power users.

## 6. Calendar View (Full Implementation)
**Problem:** The Calendar tab is currently a placeholder.
**Solution:** Build out a proper monthly calendar with due-date task surfacing.
- **Details:** Monthly grid, tap a day to see tasks due. Overdue tasks highlighted. Integration with the prescription reminder feature.
- **Value:** Time-aware task management for deadline-driven work.

## 7. Push Notifications & Smart Nudges
**Reference:** https://www.magicbell.com/blog/using-push-notifications-in-pwas
**Problem:** Nudges and due-date reminders only surface when the user opens the app. High-value tasks (especially Quadrant II — important but not urgent) can silently slip.
**Solution:** Native OS push notifications to surface reminders proactively, even when the app isn't open.

### Phase 1 — Local Notifications (no backend, fits current architecture)
- Add a `notificationService.ts` that wraps the browser Notifications API
- Request permission on first meaningful user interaction
- Service worker fires `showNotification()` on SW `activate` or via a periodic check
- Reuse existing `nudgeService.generateNudges()` output as notification content — same logic, different delivery channel
- **Candidate triggers:**
  - Task due today / overdue
  - Quadrant II tasks (`!isUrgent && isImportant`) idle for N days — "focus nudge"
  - Backup staleness (≥3 days) — already a nudge, easy to promote to notification
- **Limitation:** Only fires when device is on and OS hasn't killed the SW. Good enough for most use cases.

### Phase 2 — Full Push (requires backend, pairs with Firebase Cloud Sync)
- Generate VAPID key pair; public key sent at subscribe-time, private key signs server payloads
- Store push subscriptions in Firestore alongside synced task data
- Firebase Cloud Function sends VAPID-signed HTTP POST to stored subscription endpoints
- FCM as the push relay — works for Chrome (Android/desktop) and iOS Home Screen installs
- iOS caveat: push only works for Home Screen installed PWAs (not in-browser tabs); requires valid `manifest.json` ✅ already present
- Handle `410 Gone` responses to prune expired subscriptions
- **Natural fit:** shares the same Firebase infrastructure as Project #1 (Cloud Sync), so both should be scoped together

### Architecture Note
`notificationService.ts` should consume `nudgeService` output directly so home screen nudge cards and push notifications stay in sync without duplicating logic.

---

## Future Ideas
*Add new ideas below as they arise...*
