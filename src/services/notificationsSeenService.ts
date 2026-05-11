import { db } from '../db';

/**
 * Returns true if this event ID has already been shown as a toast.
 */
export async function hasSeen(eventId: string): Promise<boolean> {
  const existing = await db.notificationsSeen.where('eventId').equals(eventId).first();
  return existing !== undefined;
}

/**
 * Records that this event ID has been shown as a toast.
 * No-ops silently if already recorded (unique constraint on eventId).
 */
export async function markSeen(eventId: string): Promise<void> {
  try {
    await db.notificationsSeen.add({ eventId });
  } catch {
    // Unique constraint violation — already recorded, safe to ignore
  }
}
