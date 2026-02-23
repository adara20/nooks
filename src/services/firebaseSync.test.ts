import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, Bucket } from '../db';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockSetDoc,
  mockDeleteDoc,
  mockDoc,
  mockGetDocs,
  mockCollection,
  mockGetFirestore,
  mockGetAuth,
  mockInitializeApp,
  FakeTimestamp,
} = vi.hoisted(() => {
  // Fake Timestamp class — must be defined here so it's available inside vi.mock factories
  class FakeTimestamp {
    seconds: number;
    constructor(public date: Date) {
      this.seconds = Math.floor(date.getTime() / 1000);
    }
    toDate() { return this.date; }
    static fromDate(d: Date) { return new FakeTimestamp(d); }
    get _type() { return 'Timestamp'; }
  }
  return {
    mockSetDoc: vi.fn(),
    mockDeleteDoc: vi.fn(),
    mockDoc: vi.fn(),
    mockGetDocs: vi.fn(),
    mockCollection: vi.fn(),
    mockGetFirestore: vi.fn(() => ({})),
    mockGetAuth: vi.fn(() => ({ currentUser: null })),
    mockInitializeApp: vi.fn(() => ({})),
    FakeTimestamp,
  };
});

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
  collection: (db: unknown, path: string) => { mockCollection(path); return { path }; },
  setDoc: (ref: unknown, data: unknown) => mockSetDoc(data),
  deleteDoc: (ref: unknown) => { const r = ref as { path: string }; mockDeleteDoc(r.path); },
  getDocs: (ref: unknown) => mockGetDocs(ref),
  Timestamp: FakeTimestamp,
}));

import {
  syncUpsertTask,
  syncDeleteTask,
  syncUpsertBucket,
  syncDeleteBucket,
  fetchCloudData,
  pushAllToCloud,
  runInitialSync,
  auth,
} from './firebaseService';

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

// ─── Helper: build a fake Firestore QuerySnapshot ────────────────────────────

function makeSnap(docs: Record<string, unknown>[]) {
  return { docs: docs.map(d => ({ data: () => d })) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('firebaseService — sync helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockGetDocs.mockResolvedValue(makeSnap([]));
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

    // ─── fetchCloudData ────────────────────────────────────────────────────────

    describe('fetchCloudData', () => {
      it('fetches from the correct Firestore collections', async () => {
        mockGetDocs.mockResolvedValue(makeSnap([]));
        await fetchCloudData('uid-xyz');
        expect(mockCollection).toHaveBeenCalledWith('users/uid-xyz/buckets');
        expect(mockCollection).toHaveBeenCalledWith('users/uid-xyz/tasks');
      });

      it('deserialises bucket documents', async () => {
        mockGetDocs
          .mockResolvedValueOnce(makeSnap([
            { id: 10, name: 'Work', emoji: '💼', createdAt: FakeTimestamp.fromDate(new Date('2024-01-01')) },
          ]))
          .mockResolvedValueOnce(makeSnap([]));
        const result = await fetchCloudData('uid-xyz');
        expect(result.buckets).toHaveLength(1);
        expect(result.buckets[0].name).toBe('Work');
        expect(result.buckets[0].createdAt).toBeInstanceOf(Date);
      });

      it('deserialises task documents', async () => {
        mockGetDocs
          .mockResolvedValueOnce(makeSnap([])) // buckets
          .mockResolvedValueOnce(makeSnap([
            {
              id: 5,
              title: 'Do laundry',
              status: 'todo',
              isUrgent: true,
              isImportant: false,
              createdAt: FakeTimestamp.fromDate(new Date('2024-03-01')),
            },
          ]));
        const result = await fetchCloudData('uid-xyz');
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].title).toBe('Do laundry');
        expect(result.tasks[0].createdAt).toBeInstanceOf(Date);
      });

      it('returns empty arrays when collections are empty', async () => {
        mockGetDocs.mockResolvedValue(makeSnap([]));
        const result = await fetchCloudData('uid-xyz');
        expect(result.buckets).toEqual([]);
        expect(result.tasks).toEqual([]);
      });

      it('deserialises undefined for null Timestamp fields', async () => {
        mockGetDocs
          .mockResolvedValueOnce(makeSnap([])) // buckets
          .mockResolvedValueOnce(makeSnap([
            {
              id: 7,
              title: 'Task without dates',
              status: 'todo',
              isUrgent: false,
              isImportant: false,
              createdAt: FakeTimestamp.fromDate(new Date()),
              dueDate: null,
              completedAt: null,
            },
          ]));
        const result = await fetchCloudData('uid-xyz');
        expect(result.tasks[0].dueDate).toBeUndefined();
        expect(result.tasks[0].completedAt).toBeUndefined();
      });
    });

    // ─── pushAllToCloud ────────────────────────────────────────────────────────

    describe('pushAllToCloud', () => {
      it('writes all tasks and buckets to Firestore', async () => {
        await pushAllToCloud('uid-xyz', [baseTask], [baseBucket]);
        expect(mockSetDoc).toHaveBeenCalledTimes(2);
      });

      it('skips items without ids', async () => {
        await pushAllToCloud(
          'uid-xyz',
          [{ ...baseTask, id: undefined }],
          [{ ...baseBucket, id: undefined }]
        );
        expect(mockSetDoc).not.toHaveBeenCalled();
      });

      it('writes tasks to the correct path', async () => {
        await pushAllToCloud('uid-xyz', [baseTask], []);
        expect(mockDoc).toHaveBeenCalledWith('users/uid-xyz/tasks/1');
      });

      it('writes buckets to the correct path', async () => {
        await pushAllToCloud('uid-xyz', [], [baseBucket]);
        expect(mockDoc).toHaveBeenCalledWith('users/uid-xyz/buckets/2');
      });
    });

    // ─── runInitialSync ────────────────────────────────────────────────────────

    describe('runInitialSync', () => {
      const makeCallbacks = (overrides: Partial<Parameters<typeof runInitialSync>[1]> = {}) => ({
        getLocalData: vi.fn(async () => ({ buckets: [] as Bucket[], tasks: [] as Task[] })),
        insertMergedItems: vi.fn(async () => {}),
        getAllLocalData: vi.fn(async () => ({ buckets: [] as Bucket[], tasks: [] as Task[] })),
        ...overrides,
      });

      it('calls getLocalData to retrieve local state', async () => {
        mockGetDocs.mockResolvedValue(makeSnap([]));
        const callbacks = makeCallbacks();
        await runInitialSync('uid-xyz', callbacks);
        expect(callbacks.getLocalData).toHaveBeenCalledOnce();
      });

      it('calls insertMergedItems when cloud has items not in local', async () => {
        // Cloud has one bucket not in local
        mockGetDocs
          .mockResolvedValueOnce(makeSnap([
            { id: 99, name: 'Cloud Bucket', emoji: '☁️', createdAt: FakeTimestamp.fromDate(new Date()) },
          ]))
          .mockResolvedValueOnce(makeSnap([]));
        const callbacks = makeCallbacks();
        await runInitialSync('uid-xyz', callbacks);
        expect(callbacks.insertMergedItems).toHaveBeenCalledOnce();
        const inserted = (callbacks.insertMergedItems.mock.calls[0][0] as { buckets: Bucket[] });
        expect(inserted.buckets).toHaveLength(1);
        expect(inserted.buckets[0].name).toBe('Cloud Bucket');
      });

      it('does not call insertMergedItems when there is nothing new', async () => {
        // Cloud data matches local
        mockGetDocs
          .mockResolvedValueOnce(makeSnap([
            { id: 2, name: 'Test Bucket', emoji: '📁', createdAt: FakeTimestamp.fromDate(new Date()) },
          ]))
          .mockResolvedValueOnce(makeSnap([]));
        const callbacks = makeCallbacks({
          getLocalData: vi.fn(async () => ({ buckets: [baseBucket], tasks: [] })),
        });
        await runInitialSync('uid-xyz', callbacks);
        expect(callbacks.insertMergedItems).not.toHaveBeenCalled();
      });

      it('calls getAllLocalData then pushAllToCloud after merge', async () => {
        mockGetDocs.mockResolvedValue(makeSnap([]));
        const callbacks = makeCallbacks({
          getAllLocalData: vi.fn(async () => ({ buckets: [baseBucket], tasks: [baseTask] })),
        });
        await runInitialSync('uid-xyz', callbacks);
        expect(callbacks.getAllLocalData).toHaveBeenCalledOnce();
        // 1 bucket + 1 task = 2 setDoc calls
        expect(mockSetDoc).toHaveBeenCalledTimes(2);
      });
    });
  });
});
