import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repository } from './repository';
import { db } from '../db';

// ─── Mock firebaseService ─────────────────────────────────────────────────────
// Sync calls must never interfere with local DB tests, and must never throw.

const {
  mockSyncUpsertTask,
  mockSyncDeleteTask,
  mockSyncUpsertBucket,
  mockSyncDeleteBucket,
  mockSyncUpsertReminder,
  mockSyncDeleteReminder,
} = vi.hoisted(() => ({
  mockSyncUpsertTask: vi.fn(async () => {}),
  mockSyncDeleteTask: vi.fn(async () => {}),
  mockSyncUpsertBucket: vi.fn(async () => {}),
  mockSyncDeleteBucket: vi.fn(async () => {}),
  mockSyncUpsertReminder: vi.fn(async () => {}),
  mockSyncDeleteReminder: vi.fn(async () => {}),
}));

vi.mock('./firebaseService', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncUpsertTask: (task: unknown) => (mockSyncUpsertTask as any)(task),
  syncDeleteTask: (id: unknown) => (mockSyncDeleteTask as any)(id),
  syncUpsertBucket: (bucket: unknown) => (mockSyncUpsertBucket as any)(bucket),
  syncDeleteBucket: (id: unknown) => (mockSyncDeleteBucket as any)(id),
  syncUpsertReminder: (reminder: unknown) => (mockSyncUpsertReminder as any)(reminder),
  syncDeleteReminder: (id: unknown) => (mockSyncDeleteReminder as any)(id),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.tasks.clear();
  await db.buckets.clear();
  await db.reminders.clear();
  vi.clearAllMocks();
});

// ─── Bucket Tests ────────────────────────────────────────────────────────────

describe('repository: buckets', () => {
  it('adds a bucket and retrieves it', async () => {
    const id = await repository.addBucket({ name: 'Work', emoji: '💼' });
    const buckets = await repository.getAllBuckets();
    expect(buckets).toHaveLength(1);
    expect(buckets[0].name).toBe('Work');
    expect(buckets[0].emoji).toBe('💼');
    expect(buckets[0].id).toBe(id);
    expect(buckets[0].createdAt).toBeInstanceOf(Date);
  });

  it('adds multiple buckets and retrieves all', async () => {
    await repository.addBucket({ name: 'Work', emoji: '💼' });
    await repository.addBucket({ name: 'Personal', emoji: '🏠' });
    const buckets = await repository.getAllBuckets();
    expect(buckets).toHaveLength(2);
  });

  it('updates a bucket name and emoji', async () => {
    const id = await repository.addBucket({ name: 'Old Name', emoji: '📁' });
    await repository.updateBucket(id, { name: 'New Name', emoji: '🎯' });
    const buckets = await repository.getAllBuckets();
    expect(buckets[0].name).toBe('New Name');
    expect(buckets[0].emoji).toBe('🎯');
  });

  it('deletes a bucket', async () => {
    const id = await repository.addBucket({ name: 'Temp', emoji: '🗑️' });
    await repository.deleteBucket(id);
    const buckets = await repository.getAllBuckets();
    expect(buckets).toHaveLength(0);
  });

  it('deletes a bucket and unassigns its tasks rather than deleting them', async () => {
    const bucketId = await repository.addBucket({ name: 'Work', emoji: '💼' });
    await repository.addTask({ title: 'Task A', bucketId, status: 'todo', isUrgent: false, isImportant: false });
    await repository.addTask({ title: 'Task B', bucketId, status: 'todo', isUrgent: false, isImportant: false });
    await repository.deleteBucket(bucketId);
    const tasks = await repository.getAllTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks[0].bucketId).toBeUndefined();
    expect(tasks[1].bucketId).toBeUndefined();
  });

  it('deleting a bucket does not affect tasks in other buckets', async () => {
    const bucketA = await repository.addBucket({ name: 'A', emoji: '🅰️' });
    const bucketB = await repository.addBucket({ name: 'B', emoji: '🅱️' });
    await repository.addTask({ title: 'Task in B', bucketId: bucketB, status: 'todo', isUrgent: false, isImportant: false });
    await repository.deleteBucket(bucketA);
    const tasks = await repository.getAllTasks();
    expect(tasks[0].bucketId).toBe(bucketB);
  });

  // ─── Sync call verification ───────────────────────────────────────────────

  it('addBucket calls syncUpsertBucket with the saved bucket', async () => {
    const id = await repository.addBucket({ name: 'Sync Test', emoji: '🔁' });
    expect(mockSyncUpsertBucket).toHaveBeenCalledOnce();
    expect(mockSyncUpsertBucket).toHaveBeenCalledWith(expect.objectContaining({ id, name: 'Sync Test' }));
  });

  it('updateBucket calls syncUpsertBucket with updated data', async () => {
    const id = await repository.addBucket({ name: 'Before', emoji: '📁' });
    vi.clearAllMocks();
    await repository.updateBucket(id, { name: 'After' });
    expect(mockSyncUpsertBucket).toHaveBeenCalledOnce();
    expect(mockSyncUpsertBucket).toHaveBeenCalledWith(expect.objectContaining({ id, name: 'After' }));
  });

  it('deleteBucket calls syncDeleteBucket with the bucket id', async () => {
    const id = await repository.addBucket({ name: 'Gone', emoji: '👋' });
    vi.clearAllMocks();
    await repository.deleteBucket(id);
    expect(mockSyncDeleteBucket).toHaveBeenCalledOnce();
    expect(mockSyncDeleteBucket).toHaveBeenCalledWith(id);
  });

  it('local write still succeeds when syncUpsertBucket rejects', async () => {
    mockSyncUpsertBucket.mockRejectedValueOnce(new Error('network error'));
    const id = await repository.addBucket({ name: 'Resilient', emoji: '💪' });
    const buckets = await repository.getAllBuckets();
    expect(buckets).toHaveLength(1);
    expect(buckets[0].id).toBe(id);
  });
});

// ─── Task Tests ───────────────────────────────────────────────────────────────

describe('repository: tasks', () => {
  it('adds a task and retrieves it', async () => {
    const id = await repository.addTask({
      title: 'Buy milk',
      status: 'todo',
      isUrgent: false,
      isImportant: true,
    });
    const tasks = await repository.getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Buy milk');
    expect(tasks[0].id).toBe(id);
    expect(tasks[0].createdAt).toBeInstanceOf(Date);
  });

  it('adds a task with all optional fields', async () => {
    const bucketId = await repository.addBucket({ name: 'Health', emoji: '💊' });
    const dueDate = new Date('2025-12-31');
    await repository.addTask({
      title: 'Doctor appointment',
      details: 'Annual checkup',
      bucketId,
      status: 'todo',
      isUrgent: true,
      isImportant: true,
      dueDate,
    });
    const tasks = await repository.getAllTasks();
    expect(tasks[0].details).toBe('Annual checkup');
    expect(tasks[0].bucketId).toBe(bucketId);
    expect(tasks[0].dueDate).toEqual(dueDate);
  });

  it('retrieves tasks by bucket', async () => {
    const bucketA = await repository.addBucket({ name: 'A', emoji: '🅰️' });
    const bucketB = await repository.addBucket({ name: 'B', emoji: '🅱️' });
    await repository.addTask({ title: 'Task in A', bucketId: bucketA, status: 'todo', isUrgent: false, isImportant: false });
    await repository.addTask({ title: 'Task in B', bucketId: bucketB, status: 'todo', isUrgent: false, isImportant: false });
    const tasksInA = await repository.getTasksByBucket(bucketA);
    expect(tasksInA).toHaveLength(1);
    expect(tasksInA[0].title).toBe('Task in A');
  });

  it('updates a task title and details', async () => {
    const id = await repository.addTask({ title: 'Old title', status: 'todo', isUrgent: false, isImportant: false });
    await repository.updateTask(id, { title: 'New title', details: 'Some details' });
    const tasks = await repository.getAllTasks();
    expect(tasks[0].title).toBe('New title');
    expect(tasks[0].details).toBe('Some details');
  });

  it('setting status to done automatically sets completedAt', async () => {
    const id = await repository.addTask({ title: 'Finish me', status: 'todo', isUrgent: false, isImportant: false });
    await repository.updateTask(id, { status: 'done' });
    const tasks = await repository.getAllTasks();
    expect(tasks[0].status).toBe('done');
    expect(tasks[0].completedAt).toBeInstanceOf(Date);
  });

  it('setting status back from done clears completedAt', async () => {
    const id = await repository.addTask({ title: 'Back to todo', status: 'done', isUrgent: false, isImportant: false });
    await repository.updateTask(id, { status: 'todo' });
    const tasks = await repository.getAllTasks();
    expect(tasks[0].status).toBe('todo');
    expect(tasks[0].completedAt).toBeUndefined();
  });

  it('setting status to in-progress clears completedAt', async () => {
    const id = await repository.addTask({ title: 'In flight', status: 'done', isUrgent: false, isImportant: false });
    await repository.updateTask(id, { status: 'in-progress' });
    const tasks = await repository.getAllTasks();
    expect(tasks[0].completedAt).toBeUndefined();
  });

  it('setting status to done preserves an explicitly provided completedAt', async () => {
    const id = await repository.addTask({ title: 'Custom done', status: 'todo', isUrgent: false, isImportant: false });
    const customDate = new Date('2024-06-01');
    await repository.updateTask(id, { status: 'done', completedAt: customDate });
    const tasks = await repository.getAllTasks();
    expect(tasks[0].completedAt).toEqual(customDate);
  });

  it('deletes a task', async () => {
    const id = await repository.addTask({ title: 'Delete me', status: 'todo', isUrgent: false, isImportant: false });
    await repository.deleteTask(id);
    const tasks = await repository.getAllTasks();
    expect(tasks).toHaveLength(0);
  });

  it('deleting one task does not affect others', async () => {
    const id1 = await repository.addTask({ title: 'Keep me', status: 'todo', isUrgent: false, isImportant: false });
    const id2 = await repository.addTask({ title: 'Delete me', status: 'todo', isUrgent: false, isImportant: false });
    await repository.deleteTask(id2);
    const tasks = await repository.getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(id1);
  });

  // ─── Sync call verification ───────────────────────────────────────────────

  it('addTask calls syncUpsertTask with the saved task', async () => {
    const id = await repository.addTask({ title: 'Sync me', status: 'todo', isUrgent: false, isImportant: false });
    expect(mockSyncUpsertTask).toHaveBeenCalledOnce();
    expect(mockSyncUpsertTask).toHaveBeenCalledWith(expect.objectContaining({ id, title: 'Sync me' }));
  });

  it('updateTask calls syncUpsertTask with updated data', async () => {
    const id = await repository.addTask({ title: 'Before', status: 'todo', isUrgent: false, isImportant: false });
    vi.clearAllMocks();
    await repository.updateTask(id, { title: 'After' });
    expect(mockSyncUpsertTask).toHaveBeenCalledOnce();
    expect(mockSyncUpsertTask).toHaveBeenCalledWith(expect.objectContaining({ id, title: 'After' }));
  });

  it('deleteTask calls syncDeleteTask with the task id', async () => {
    const id = await repository.addTask({ title: 'Gone', status: 'todo', isUrgent: false, isImportant: false });
    vi.clearAllMocks();
    await repository.deleteTask(id);
    expect(mockSyncDeleteTask).toHaveBeenCalledOnce();
    expect(mockSyncDeleteTask).toHaveBeenCalledWith(id);
  });

  it('local write still succeeds when syncUpsertTask rejects', async () => {
    mockSyncUpsertTask.mockRejectedValueOnce(new Error('network error'));
    const id = await repository.addTask({ title: 'Resilient', status: 'todo', isUrgent: false, isImportant: false });
    const tasks = await repository.getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(id);
  });

  it('local write still succeeds when syncDeleteTask rejects', async () => {
    const id = await repository.addTask({ title: 'Delete resilient', status: 'todo', isUrgent: false, isImportant: false });
    mockSyncDeleteTask.mockRejectedValueOnce(new Error('network error'));
    await repository.deleteTask(id);
    const tasks = await repository.getAllTasks();
    expect(tasks).toHaveLength(0);
  });
});

// ─── Reminder Tests ─────────────────────────────────────────────────────────

describe('repository: reminders', () => {
  it('adds a reminder and retrieves it', async () => {
    const id = await repository.addReminder({
      title: 'Refill prescription',
      intervalDays: 35,
      nextDueDate: new Date('2026-08-06'),
      active: true,
    });
    const reminders = await repository.getReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe(id);
    expect(reminders[0].title).toBe('Refill prescription');
    expect(reminders[0].intervalDays).toBe(35);
    expect(reminders[0].active).toBe(true);
    expect(reminders[0].createdAt).toBeInstanceOf(Date);
  });

  it('adds multiple reminders and retrieves all', async () => {
    await repository.addReminder({ title: 'A', intervalDays: 7, nextDueDate: new Date(), active: true });
    await repository.addReminder({ title: 'B', intervalDays: 14, nextDueDate: new Date(), active: true });
    const reminders = await repository.getReminders();
    expect(reminders).toHaveLength(2);
  });

  it('updates a reminder', async () => {
    const id = await repository.addReminder({ title: 'Old', intervalDays: 7, nextDueDate: new Date('2026-01-01'), active: true });
    const newDueDate = new Date('2026-01-08');
    await repository.updateReminder(id, { nextDueDate: newDueDate, active: false });
    const reminders = await repository.getReminders();
    expect(reminders[0].nextDueDate).toEqual(newDueDate);
    expect(reminders[0].active).toBe(false);
  });

  it('deletes a reminder', async () => {
    const id = await repository.addReminder({ title: 'Temp', intervalDays: 7, nextDueDate: new Date(), active: true });
    await repository.deleteReminder(id);
    const reminders = await repository.getReminders();
    expect(reminders).toHaveLength(0);
  });

  it('deleting a non-existent reminder does not throw', async () => {
    await expect(repository.deleteReminder(999999)).resolves.not.toThrow();
  });

  it('deleting one reminder does not affect others', async () => {
    const id1 = await repository.addReminder({ title: 'Keep me', intervalDays: 7, nextDueDate: new Date(), active: true });
    const id2 = await repository.addReminder({ title: 'Delete me', intervalDays: 7, nextDueDate: new Date(), active: true });
    await repository.deleteReminder(id2);
    const reminders = await repository.getReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe(id1);
  });

  // ─── Sync call verification ───────────────────────────────────────────────

  it('addReminder calls syncUpsertReminder with the saved reminder', async () => {
    const id = await repository.addReminder({ title: 'Sync Test', intervalDays: 7, nextDueDate: new Date(), active: true });
    expect(mockSyncUpsertReminder).toHaveBeenCalledOnce();
    expect(mockSyncUpsertReminder).toHaveBeenCalledWith(expect.objectContaining({ id, title: 'Sync Test' }));
  });

  it('updateReminder calls syncUpsertReminder with updated data', async () => {
    const id = await repository.addReminder({ title: 'Before', intervalDays: 7, nextDueDate: new Date(), active: true });
    vi.clearAllMocks();
    await repository.updateReminder(id, { title: 'After' });
    expect(mockSyncUpsertReminder).toHaveBeenCalledOnce();
    expect(mockSyncUpsertReminder).toHaveBeenCalledWith(expect.objectContaining({ id, title: 'After' }));
  });

  it('deleteReminder calls syncDeleteReminder with the reminder id', async () => {
    const id = await repository.addReminder({ title: 'Gone', intervalDays: 7, nextDueDate: new Date(), active: true });
    vi.clearAllMocks();
    await repository.deleteReminder(id);
    expect(mockSyncDeleteReminder).toHaveBeenCalledOnce();
    expect(mockSyncDeleteReminder).toHaveBeenCalledWith(id);
  });

  it('local write still succeeds when syncUpsertReminder rejects', async () => {
    mockSyncUpsertReminder.mockRejectedValueOnce(new Error('network error'));
    const id = await repository.addReminder({ title: 'Resilient', intervalDays: 7, nextDueDate: new Date(), active: true });
    const reminders = await repository.getReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe(id);
  });

  it('local write still succeeds when syncDeleteReminder rejects', async () => {
    const id = await repository.addReminder({ title: 'Delete resilient', intervalDays: 7, nextDueDate: new Date(), active: true });
    mockSyncDeleteReminder.mockRejectedValueOnce(new Error('network error'));
    await repository.deleteReminder(id);
    const reminders = await repository.getReminders();
    expect(reminders).toHaveLength(0);
  });
});

// ─── Seed Tests ───────────────────────────────────────────────────────────────

describe('repository: seedIfEmpty', () => {
  it('seeds 3 buckets and 3 tasks on first run', async () => {
    await repository.seedIfEmpty();
    const buckets = await repository.getAllBuckets();
    const tasks = await repository.getAllTasks();
    expect(buckets).toHaveLength(3);
    expect(tasks).toHaveLength(3);
  });

  it('does not seed again if buckets already exist', async () => {
    await repository.addBucket({ name: 'Existing', emoji: '✅' });
    await repository.seedIfEmpty();
    const buckets = await repository.getAllBuckets();
    expect(buckets).toHaveLength(1);
  });

  it('seeded tasks are assigned to seeded buckets', async () => {
    await repository.seedIfEmpty();
    const tasks = await repository.getAllTasks();
    const buckets = await repository.getAllBuckets();
    const bucketIds = new Set(buckets.map(b => b.id));
    tasks.forEach(task => {
      expect(bucketIds.has(task.bucketId)).toBe(true);
    });
  });
});
