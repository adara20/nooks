import { type Reminder } from '../db';

/**
 * Computes the next due date by advancing `current` by `intervalDays`.
 * `intervalDays` must be a positive integer — callers are responsible for
 * validating user input before persisting a Reminder.
 */
export function computeNextDueDate(current: Date, intervalDays: number): Date {
  const next = new Date(current);
  next.setDate(next.getDate() + intervalDays);
  return next;
}

/**
 * Returns true if an active reminder's nextDueDate has arrived.
 * Inactive (paused) reminders are never due.
 */
export function isDue(reminder: Reminder, now: Date = new Date()): boolean {
  if (!reminder.active) return false;
  return reminder.nextDueDate.getTime() <= now.getTime();
}
