import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, Bucket } from '../db';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSetDoc, mockDeleteDoc, mockDoc, mockGetFirestore, mockGetAuth, mockInitializeApp } =
  vi.hoisted(() => ({
    mockSetDoc: vi.fn(),
    mockDeleteDoc: vi.fn(),
    mockDoc: vi.fn(),
    mockGetFirestore: vi.fn(() => ({})),
    mockGetAuth: vi.fn(() => ({ currentUser: null })),
    mockInitializeApp: vi.fn(() => ({})),
  }));

vi.mock('firebase/app', () => ({
  initializeApp: () => mockInitializeApp(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => mockGetAuth(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(() => vi.fn()),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: () => mockGetFirestore(),
  doc: (db: unknown, path: string) => { mockDoc(path); return { path }; },
  setDoc: (ref: unknown, data: unknown) => mockSetDoc(data),
  deleteDoc: (ref: unknown) => { const r = ref as { path: string }; mockDeleteDoc(r.path); },
  Timestamp: {
    fromDate: (d: Date) => ({ _type: 'Timestamp', seconds: Math.floor(d.getTime() / 1000) }),
  },
}));

import { syncUpsertTask, syncDeleteTask, syncUpsertBucket, syncDeleteBucket, auth } from './firebaseService';

// ─── Test data ────────────────────────────────────────────────────────────────

const baseTask: Task = {
  id: 1,
  title: 'Test task',
  status: 'todo',
  isUrgent: false,
  isImportant: false,
  createdAt: new Date('2024-01-01'),
};

const baseBucket: Bucket = {
  id: 2,
  name: 'Test Bucket',
  emoji: '📁',
  createdAt: new Date('2024-01-01'),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('firebaseService — sync helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockGetAuth.mockReturnValue({ currentUser: null });
    mockGetFirestore.mockReturnValue({});
  });

  describe('when user is not signed in (currentUser is null)', () => {
    beforeEach(() => {
      Object.defineProperty(auth, 'currentUser', { value: null, configurable: true });
    });

    it('syncUpsertTask is a no-op', async () => {
      await syncUpsertTask(baseTask);
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('syncDeleteTask is a no-op', async () => {
      await syncDeleteTask(1);
      expect(mockDeleteDoc).not.toHaveBeenCalled();
    });

    it('syncUpsertBucket is a no-op', async () => {
      await syncUpsertBucket(baseBucket);
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('syncDeleteBucket is a no-op', async () => {
      await syncDeleteBucket(2);
      expect(mockDeleteDoc).not.toHaveBeenCalled();
    });
  });

  describe('when user is signed in', () => {
    beforeEach(() => {
      Object.defineProperty(auth, 'currentUser', {
        value: { uid: 'uid-abc' },
        configurable: true,
      });
    });

    describe('syncUpsertTask', () => {
      it('writes to the correct Firestore path', async () => {
        await syncUpsertTask(baseTask);
        expect(mockDoc).toHaveBeenCalledWith('users/uid-abc/tasks/1');
        expect(mockSetDoc).toHaveBeenCalledOnce();
      });

      it('serialises task fields correctly', async () => {
        await syncUpsertTask({ ...baseTask, dueDate: new Date('2025-06-01') });
        const data = mockSetDoc.mock.lastCall?.[0] as Record<string, unknown>;
        expect(data.title).toBe('Test task');
        expect(data.status).toBe('todo');
        // Dates serialised to Timestamps
        expect((data.createdAt as { _type: string })._type).toBe('Timestamp');
        expect((data.dueDate as { _type: string })._type).toBe('Timestamp');
      });

      it('serialises null for undefined optional date fields', async () => {
        await syncUpsertTask(baseTask); // no dueDate, no completedAt
        const data = mockSetDoc.mock.lastCall?.[0] as Record<string, unknown>;
        expect(data.dueDate).toBeNull();
        expect(data.completedAt).toBeNull();
      });

      it('is a no-op when task has no id', async () => {
        await syncUpsertTask({ ...baseTask, id: undefined });
        expect(mockSetDoc).not.toHaveBeenCalled();
      });

      it('swallows errors — does not throw', async () => {
        mockSetDoc.mockRejectedValueOnce(new Error('network'));
        await expect(syncUpsertTask(baseTask)).resolves.toBeUndefined();
      });
    });

    describe('syncDeleteTask', () => {
      it('deletes the correct Firestore path', async () => {
        await syncDeleteTask(42);
        expect(mockDoc).toHaveBeenCalledWith('users/uid-abc/tasks/42');
        expect(mockDeleteDoc).toHaveBeenCalledWith('users/uid-abc/tasks/42');
      });

      it('swallows errors — does not throw', async () => {
        mockDeleteDoc.mockRejectedValueOnce(new Error('network'));
        await expect(syncDeleteTask(1)).resolves.toBeUndefined();
      });
    });

    describe('syncUpsertBucket', () => {
      it('writes to the correct Firestore path', async () => {
        await syncUpsertBucket(baseBucket);
        expect(mockDoc).toHaveBeenCalledWith('users/uid-abc/buckets/2');
        expect(mockSetDoc).toHaveBeenCalledOnce();
      });

      it('serialises bucket fields correctly', async () => {
        await syncUpsertBucket(baseBucket);
        const data = mockSetDoc.mock.lastCall?.[0] as Record<string, unknown>;
        expect(data.name).toBe('Test Bucket');
        expect(data.emoji).toBe('📁');
        expect((data.createdAt as { _type: string })._type).toBe('Timestamp');
      });

      it('is a no-op when bucket has no id', async () => {
        await syncUpsertBucket({ ...baseBucket, id: undefined });
        expect(mockSetDoc).not.toHaveBeenCalled();
      });

      it('swallows errors — does not throw', async () => {
        mockSetDoc.mockRejectedValueOnce(new Error('network'));
        await expect(syncUpsertBucket(baseBucket)).resolves.toBeUndefined();
      });
    });

    describe('syncDeleteBucket', () => {
      it('deletes the correct Firestore path', async () => {
        await syncDeleteBucket(5);
        expect(mockDoc).toHaveBeenCalledWith('users/uid-abc/buckets/5');
        expect(mockDeleteDoc).toHaveBeenCalledWith('users/uid-abc/buckets/5');
      });

      it('swallows errors — does not throw', async () => {
        mockDeleteDoc.mockRejectedValueOnce(new Error('network'));
        await expect(syncDeleteBucket(2)).resolves.toBeUndefined();
      });
    });
  });
});
