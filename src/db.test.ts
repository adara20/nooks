import { describe, it, expect, afterEach } from 'vitest';
import Dexie, { type Table } from 'dexie';
import { db, type Bucket, type Task, type NotificationSeen } from './db';

// Simulates the pre-reminders schema (Dexie version 2) so we can verify the
// v2 -> v3 upgrade is non-destructive when the reminders table is introduced.
class LegacyDB extends Dexie {
  buckets!: Table<Bucket>;
  tasks!: Table<Task>;
  notificationsSeen!: Table<NotificationSeen>;

  constructor() {
    super('NooksDB');
    this.version(1).stores({
      buckets: '++id, name',
      tasks: '++id, bucketId, status, isUrgent, isImportant, dueDate',
    });
    this.version(2).stores({
      buckets: '++id, name',
      tasks: '++id, bucketId, status, isUrgent, isImportant, dueDate',
      notificationsSeen: '++id, &eventId',
    });
  }
}

describe('NooksDatabase schema migration v2 -> v3 (reminders)', () => {
  afterEach(async () => {
    db.close();
    await Dexie.delete('NooksDB');
  });

  it('preserves existing v2 data and adds an empty reminders table after upgrading', async () => {
    const legacy = new LegacyDB();
    await legacy.open();
    const bucketId = await legacy.buckets.add({
      name: 'Legacy Bucket',
      emoji: '📦',
      createdAt: new Date('2024-01-01'),
    });
    await legacy.tasks.add({
      title: 'Legacy Task',
      bucketId,
      status: 'todo',
      isUrgent: false,
      isImportant: false,
      createdAt: new Date('2024-01-01'),
    });
    await legacy.notificationsSeen.add({ eventId: 'inbox:created:1' });
    legacy.close();

    // Opening the production `db` singleton (which declares versions 1-3)
    // against the same underlying database must run the v2 -> v3 upgrade.
    await db.open();

    const buckets = await db.buckets.toArray();
    const tasks = await db.tasks.toArray();
    const seen = await db.notificationsSeen.toArray();
    const reminders = await db.reminders.toArray();

    expect(buckets).toHaveLength(1);
    expect(buckets[0].name).toBe('Legacy Bucket');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Legacy Task');
    expect(seen).toHaveLength(1);
    expect(seen[0].eventId).toBe('inbox:created:1');
    expect(reminders).toHaveLength(0);
  });

  it('the reminders table is usable immediately after migration', async () => {
    const legacy = new LegacyDB();
    await legacy.open();
    await legacy.buckets.add({ name: 'Legacy Bucket', emoji: '📦', createdAt: new Date('2024-01-01') });
    legacy.close();

    await db.open();
    const id = await db.reminders.add({
      title: 'Refill prescription',
      intervalDays: 35,
      nextDueDate: new Date('2026-08-01'),
      active: true,
      createdAt: new Date('2026-07-02'),
    });
    const reminder = await db.reminders.get(id);
    expect(reminder?.title).toBe('Refill prescription');
    expect(reminder?.intervalDays).toBe(35);
  });

  it('a brand-new database (no prior version) opens directly at v3 with an empty reminders table', async () => {
    await db.open();
    const reminders = await db.reminders.toArray();
    expect(reminders).toHaveLength(0);
  });
});
