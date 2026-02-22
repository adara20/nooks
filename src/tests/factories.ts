import { type Bucket, type Task, type TaskStatus } from '../db';

let idCounter = 1;

export function createBucket(overrides: Partial<Bucket> = {}): Bucket {
  return {
    id: idCounter++,
    name: 'Test Bucket',
    emoji: '📁',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: idCounter++,
    title: 'Test Task',
    status: 'todo' as TaskStatus,
    isUrgent: false,
    isImportant: false,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}
