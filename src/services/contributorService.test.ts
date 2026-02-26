import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';

// ─── Mock firebase/firestore ──────────────────────────────────────────────────
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn((_db, path) => ({ path })),
    doc: vi.fn((_db, path) => ({ path })),
    setDoc: vi.fn(async () => {}),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    deleteDoc: vi.fn(async () => {}),
    updateDoc: vi.fn(async () => {}),
    addDoc: vi.fn(async () => ({ id: 'new-doc-id' })),
    query: vi.fn((...args) => args),
    where: vi.fn((...args) => args),
    Timestamp: actual.Timestamp,
  };
});

// ─── Mock firebaseService (just needs to export firestore) ────────────────────
vi.mock('./firebaseService', () => ({
  firestore: {},
}));

import {
  generateInviteCode,
  redeemInviteCode,
  getContributorPermission,
  removeContributorPermission,
  submitInboxTask,
  getContributorSubmissions,
  deleteInboxItem,
  fetchPendingInboxItems,
  getPendingInboxCount,
  acceptInboxItem,
  declineInboxItem,
  getAcceptedTaskStatus,
  getAppMode,
  setAppMode,
  getStoredOwnerUID,
  getStoredOwnerEmail,
  storeOwnerInfo,
  clearOwnerInfo,
} from './contributorService';

import {
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  addDoc,
} from 'firebase/firestore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnap(exists: boolean, data: Record<string, unknown> = {}) {
  return { exists: () => exists, data: () => data, id: 'doc-id' };
}

function makeQuerySnap(docs: { id: string; data: Record<string, unknown> }[]) {
  return {
    docs: docs.map(d => ({ id: d.id, data: () => d.data })),
  };
}

function makeFutureTimestamp(daysFromNow: number) {
  return Timestamp.fromDate(new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000));
}

function makePastTimestamp(daysAgo: number) {
  return Timestamp.fromDate(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── generateInviteCode ───────────────────────────────────────────────────────

describe('generateInviteCode', () => {
  it('calls setDoc and returns an 8-character code', async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);
    const code = await generateInviteCode('owner-uid', 'owner@example.com');
    expect(typeof code).toBe('string');
    expect(code.length).toBe(8);
    expect(setDoc).toHaveBeenCalledOnce();
  });

  it('stores ownerUID and ownerEmail in the invite doc', async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);
    await generateInviteCode('uid-123', 'test@test.com');
    const callArg = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(callArg.ownerUID).toBe('uid-123');
    expect(callArg.ownerEmail).toBe('test@test.com');
  });

  it('sets expiresAt ~7 days from now', async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);
    const before = Date.now();
    await generateInviteCode('uid', 'email@x.com');
    const after = Date.now();
    const callArg = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    const expiresAt = (callArg.expiresAt as Timestamp).toDate().getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDays - 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + sevenDays + 1000);
  });
});

// ─── redeemInviteCode ─────────────────────────────────────────────────────────

describe('redeemInviteCode', () => {
  it('throws if the invite does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(false) as never);
    await expect(
      redeemInviteCode('BADCODE', 'contributor-uid', 'contrib@x.com')
    ).rejects.toThrow('Invalid invite code.');
  });

  it('throws if the invite has expired', async () => {
    vi.mocked(getDoc).mockResolvedValue(
      makeSnap(true, {
        ownerUID: 'owner-uid',
        ownerEmail: 'owner@x.com',
        expiresAt: makePastTimestamp(1),
      }) as never
    );
    await expect(
      redeemInviteCode('EXPIREDCODE', 'contrib-uid', 'contrib@x.com')
    ).rejects.toThrow('expired');
  });

  it('throws if the invite has already been redeemed', async () => {
    vi.mocked(getDoc).mockResolvedValue(
      makeSnap(true, {
        ownerUID: 'owner-uid',
        ownerEmail: 'owner@x.com',
        expiresAt: makeFutureTimestamp(7),
        redeemedBy: 'someone-else',
      }) as never
    );
    await expect(
      redeemInviteCode('USEDCODE', 'contrib-uid', 'contrib@x.com')
    ).rejects.toThrow('already been used');
  });

  it('marks invite redeemed and writes permission doc on success', async () => {
    vi.mocked(getDoc).mockResolvedValue(
      makeSnap(true, {
        ownerUID: 'owner-uid',
        ownerEmail: 'owner@x.com',
        expiresAt: makeFutureTimestamp(7),
      }) as never
    );
    vi.mocked(updateDoc).mockResolvedValue(undefined);
    vi.mocked(setDoc).mockResolvedValue(undefined);

    const result = await redeemInviteCode('VALIDCODE', 'contrib-uid', 'contrib@x.com');

    expect(result.ownerUID).toBe('owner-uid');
    expect(result.ownerEmail).toBe('owner@x.com');
    expect(updateDoc).toHaveBeenCalledOnce();
    expect(setDoc).toHaveBeenCalledOnce();

    const permDoc = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(permDoc.ownerUID).toBe('owner-uid');
    expect(permDoc.ownerEmail).toBe('owner@x.com');
  });
});

// ─── getContributorPermission ─────────────────────────────────────────────────

describe('getContributorPermission', () => {
  it('returns null if no permission doc exists', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(false) as never);
    const result = await getContributorPermission('contrib-uid');
    expect(result).toBeNull();
  });

  it('returns the permission object if doc exists', async () => {
    const linkedAt = Timestamp.fromDate(new Date('2024-01-01'));
    vi.mocked(getDoc).mockResolvedValue(
      makeSnap(true, {
        ownerUID: 'owner-uid',
        ownerEmail: 'owner@x.com',
        linkedAt,
      }) as never
    );
    const result = await getContributorPermission('contrib-uid');
    expect(result?.ownerUID).toBe('owner-uid');
    expect(result?.ownerEmail).toBe('owner@x.com');
    expect(result?.linkedAt).toBeInstanceOf(Date);
  });
});

// ─── removeContributorPermission ──────────────────────────────────────────────

describe('removeContributorPermission', () => {
  it('calls deleteDoc on the permission path', async () => {
    vi.mocked(deleteDoc).mockResolvedValue(undefined);
    await removeContributorPermission('contrib-uid');
    expect(deleteDoc).toHaveBeenCalledOnce();
  });
});

// ─── submitInboxTask ──────────────────────────────────────────────────────────

describe('submitInboxTask', () => {
  it('calls addDoc and returns the doc id', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'inbox-doc-1' } as never);
    const id = await submitInboxTask('owner-uid', {
      title: 'Buy milk',
      isUrgent: true,
      isImportant: false,
      contributorUID: 'contrib-uid',
      contributorEmail: 'contrib@x.com',
    });
    expect(id).toBe('inbox-doc-1');
    expect(addDoc).toHaveBeenCalledOnce();
  });

  it('stores status as pending', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'inbox-doc-2' } as never);
    await submitInboxTask('owner-uid', {
      title: 'Task',
      isUrgent: false,
      isImportant: true,
      contributorUID: 'contrib-uid',
      contributorEmail: 'contrib@x.com',
    });
    const callArg = vi.mocked(addDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(callArg.status).toBe('pending');
  });

  it('serialises optional dueDate to Timestamp', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'inbox-doc-3' } as never);
    const dueDate = new Date('2025-12-25');
    await submitInboxTask('owner-uid', {
      title: 'Christmas task',
      isUrgent: false,
      isImportant: false,
      dueDate,
      contributorUID: 'contrib-uid',
      contributorEmail: 'contrib@x.com',
    });
    const callArg = vi.mocked(addDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(callArg.dueDate).toBeInstanceOf(Timestamp);
  });

  it('serialises null when dueDate is undefined', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'inbox-doc-4' } as never);
    await submitInboxTask('owner-uid', {
      title: 'No date task',
      isUrgent: false,
      isImportant: false,
      contributorUID: 'contrib-uid',
      contributorEmail: 'contrib@x.com',
    });
    const callArg = vi.mocked(addDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(callArg.dueDate).toBeNull();
  });
});

// ─── getContributorSubmissions ────────────────────────────────────────────────

describe('getContributorSubmissions', () => {
  it('returns empty array when no submissions exist', async () => {
    vi.mocked(getDocs).mockResolvedValue(makeQuerySnap([]) as never);
    const result = await getContributorSubmissions('owner-uid', 'contrib-uid');
    expect(result).toEqual([]);
  });

  it('deserialises and returns submissions', async () => {
    vi.mocked(getDocs).mockResolvedValue(
      makeQuerySnap([
        {
          id: 'item-1',
          data: {
            title: 'Buy milk',
            isUrgent: true,
            isImportant: false,
            contributorUID: 'contrib-uid',
            contributorEmail: 'contrib@x.com',
            status: 'pending',
            createdAt: Timestamp.fromDate(new Date('2024-01-01')),
          },
        },
      ]) as never
    );
    const result = await getContributorSubmissions('owner-uid', 'contrib-uid');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Buy milk');
    expect(result[0].status).toBe('pending');
    expect(result[0].id).toBe('item-1');
  });
});

// ─── deleteInboxItem ──────────────────────────────────────────────────────────

describe('deleteInboxItem', () => {
  it('calls deleteDoc with the correct path', async () => {
    vi.mocked(deleteDoc).mockResolvedValue(undefined);
    await deleteInboxItem('owner-uid', 'inbox-123');
    expect(deleteDoc).toHaveBeenCalledOnce();
  });
});

// ─── fetchPendingInboxItems ───────────────────────────────────────────────────

describe('fetchPendingInboxItems', () => {
  it('returns only pending items', async () => {
    vi.mocked(getDocs).mockResolvedValue(
      makeQuerySnap([
        {
          id: 'pending-1',
          data: {
            title: 'Pending task',
            isUrgent: false,
            isImportant: true,
            contributorUID: 'contrib-uid',
            contributorEmail: 'contrib@x.com',
            status: 'pending',
            createdAt: Timestamp.fromDate(new Date()),
          },
        },
      ]) as never
    );
    const items = await fetchPendingInboxItems('owner-uid');
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('pending');
  });

  it('returns empty array when no pending items', async () => {
    vi.mocked(getDocs).mockResolvedValue(makeQuerySnap([]) as never);
    const items = await fetchPendingInboxItems('owner-uid');
    expect(items).toEqual([]);
  });
});

// ─── getPendingInboxCount ─────────────────────────────────────────────────────

describe('getPendingInboxCount', () => {
  it('returns 0 when inbox is empty', async () => {
    vi.mocked(getDocs).mockResolvedValue(makeQuerySnap([]) as never);
    const count = await getPendingInboxCount('owner-uid');
    expect(count).toBe(0);
  });

  it('returns the number of pending items', async () => {
    const pendingDoc = {
      title: 'Task',
      isUrgent: false,
      isImportant: false,
      contributorUID: 'c',
      contributorEmail: 'c@x.com',
      status: 'pending',
      createdAt: Timestamp.fromDate(new Date()),
    };
    vi.mocked(getDocs).mockResolvedValue(
      makeQuerySnap([
        { id: '1', data: pendingDoc },
        { id: '2', data: pendingDoc },
        { id: '3', data: pendingDoc },
      ]) as never
    );
    const count = await getPendingInboxCount('owner-uid');
    expect(count).toBe(3);
  });
});

// ─── acceptInboxItem ──────────────────────────────────────────────────────────

describe('acceptInboxItem', () => {
  it('calls updateDoc with status accepted and taskId', async () => {
    vi.mocked(updateDoc).mockResolvedValue(undefined);
    await acceptInboxItem('owner-uid', 'inbox-id', 42);
    expect(updateDoc).toHaveBeenCalledOnce();
    const callArg = vi.mocked(updateDoc).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(callArg.status).toBe('accepted');
    expect(callArg.taskId).toBe(42);
  });
});

// ─── declineInboxItem ─────────────────────────────────────────────────────────

describe('declineInboxItem', () => {
  it('calls updateDoc with status declined', async () => {
    vi.mocked(updateDoc).mockResolvedValue(undefined);
    await declineInboxItem('owner-uid', 'inbox-id');
    expect(updateDoc).toHaveBeenCalledOnce();
    const callArg = vi.mocked(updateDoc).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(callArg.status).toBe('declined');
  });
});

// ─── getAcceptedTaskStatus ────────────────────────────────────────────────────

describe('getAcceptedTaskStatus', () => {
  it('returns the task status when task exists', async () => {
    vi.mocked(getDoc).mockResolvedValue(
      makeSnap(true, { status: 'in-progress' }) as never
    );
    const status = await getAcceptedTaskStatus('owner-uid', 5);
    expect(status).toBe('in-progress');
  });

  it('returns null when task does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue(makeSnap(false) as never);
    const status = await getAcceptedTaskStatus('owner-uid', 999);
    expect(status).toBeNull();
  });

  it('returns null when getDoc throws', async () => {
    vi.mocked(getDoc).mockRejectedValue(new Error('network error'));
    const status = await getAcceptedTaskStatus('owner-uid', 1);
    expect(status).toBeNull();
  });
});

// ─── localStorage helpers ─────────────────────────────────────────────────────

describe('localStorage helpers', () => {
  it('getAppMode returns owner by default', () => {
    expect(getAppMode()).toBe('owner');
  });

  it('setAppMode persists and getAppMode reads it', () => {
    setAppMode('contributor');
    expect(getAppMode()).toBe('contributor');
  });

  it('storeOwnerInfo persists ownerUID and ownerEmail', () => {
    storeOwnerInfo('uid-abc', 'owner@x.com');
    expect(getStoredOwnerUID()).toBe('uid-abc');
    expect(getStoredOwnerEmail()).toBe('owner@x.com');
  });

  it('clearOwnerInfo removes ownerUID and ownerEmail', () => {
    storeOwnerInfo('uid-abc', 'owner@x.com');
    clearOwnerInfo();
    expect(getStoredOwnerUID()).toBeNull();
    expect(getStoredOwnerEmail()).toBeNull();
  });
});
