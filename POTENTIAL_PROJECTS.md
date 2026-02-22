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

---

## Future Ideas
*Add new ideas below as they arise...*
