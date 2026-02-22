import Dexie, { type Table } from 'dexie';

export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'backlog';

export interface Bucket {
  id?: number;
  name: string;
  emoji: string;
  createdAt: Date;
}

export interface Task {
  id?: number;
  title: string;
  details?: string;
  bucketId?: number;
  status: TaskStatus;
  isUrgent: boolean;
  isImportant: boolean;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
}

export class NooksDatabase extends Dexie {
  buckets!: Table<Bucket>;
  tasks!: Table<Task>;

  constructor() {
    super('NooksDB');
    this.version(1).stores({
      buckets: '++id, name',
      tasks: '++id, bucketId, status, isUrgent, isImportant, dueDate'
    });
  }
}

export const db = new NooksDatabase();
