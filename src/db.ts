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
  contributorUID?: string;  // set when task originated from a contributor inbox submission
}

export interface NotificationSeen {
  id?: number;
  eventId: string;
}

export interface Reminder {
  id?: number;
  title: string;
  intervalDays: number;
  nextDueDate: Date;
  active: boolean;
  createdAt: Date;
  lastFiredAt?: Date;
}

export class NooksDatabase extends Dexie {
  buckets!: Table<Bucket>;
  tasks!: Table<Task>;
  notificationsSeen!: Table<NotificationSeen>;
  reminders!: Table<Reminder>;

  constructor() {
    super('NooksDB');
    this.version(1).stores({
      buckets: '++id, name',
      tasks: '++id, bucketId, status, isUrgent, isImportant, dueDate'
    });
    this.version(2).stores({
      buckets: '++id, name',
      tasks: '++id, bucketId, status, isUrgent, isImportant, dueDate',
      notificationsSeen: '++id, &eventId',
    });
    this.version(3).stores({
      buckets: '++id, name',
      tasks: '++id, bucketId, status, isUrgent, isImportant, dueDate',
      notificationsSeen: '++id, &eventId',
      reminders: '++id, active, nextDueDate',
    });
  }
}

export const db = new NooksDatabase();
