import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from './repository';
import { db } from '../db';

// Clear all tables before each test for full isolation
beforeEach(async () => {
  await db.tasks.clear();
  await db.buckets.clear();
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
    // Should still only be 1 — seed was skipped
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
