import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { hasSeen, markSeen } from './notificationsSeenService';

describe('notificationsSeenService', () => {
  beforeEach(async () => {
    await db.notificationsSeen.clear();
  });

  describe('hasSeen', () => {
    it('returns false when eventId has not been recorded', async () => {
      const result = await hasSeen('inbox:created:abc123');
      expect(result).toBe(false);
    });

    it('returns true when eventId has been recorded', async () => {
      await db.notificationsSeen.add({ eventId: 'inbox:created:abc123' });
      const result = await hasSeen('inbox:created:abc123');
      expect(result).toBe(true);
    });

    it('is case-sensitive — different casing is treated as unseen', async () => {
      await db.notificationsSeen.add({ eventId: 'inbox:created:ABC' });
      const result = await hasSeen('inbox:created:abc');
      expect(result).toBe(false);
    });
  });

  describe('markSeen', () => {
    it('adds a new eventId to the table', async () => {
      await markSeen('inbox:created:xyz');
      const result = await hasSeen('inbox:created:xyz');
      expect(result).toBe(true);
    });

    it('does not throw when called twice with the same eventId', async () => {
      await markSeen('inbox:status:doc1:accepted');
      await expect(markSeen('inbox:status:doc1:accepted')).resolves.toBeUndefined();
    });

    it('still records the first call when called twice', async () => {
      await markSeen('task:status:task1:done');
      await markSeen('task:status:task1:done');
      const count = await db.notificationsSeen.where('eventId').equals('task:status:task1:done').count();
      expect(count).toBe(1);
    });

    it('records multiple distinct eventIds independently', async () => {
      await markSeen('inbox:created:doc1');
      await markSeen('inbox:created:doc2');
      await markSeen('task:status:task1:done');

      expect(await hasSeen('inbox:created:doc1')).toBe(true);
      expect(await hasSeen('inbox:created:doc2')).toBe(true);
      expect(await hasSeen('task:status:task1:done')).toBe(true);
      expect(await hasSeen('inbox:created:doc3')).toBe(false);
    });
  });

  describe('event ID format coverage', () => {
    it('handles inbox:created:{inboxId} format', async () => {
      const eventId = 'inbox:created:firestore-doc-id-001';
      await markSeen(eventId);
      expect(await hasSeen(eventId)).toBe(true);
    });

    it('handles inbox:status:{inboxId}:{status} format', async () => {
      const accepted = 'inbox:status:doc1:accepted';
      const declined = 'inbox:status:doc1:declined';
      await markSeen(accepted);
      expect(await hasSeen(accepted)).toBe(true);
      expect(await hasSeen(declined)).toBe(false);
    });

    it('handles task:status:{taskId}:{status} format', async () => {
      const eventId = 'task:status:task42:in-progress';
      await markSeen(eventId);
      expect(await hasSeen(eventId)).toBe(true);
    });
  });
});
