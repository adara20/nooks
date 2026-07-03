import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockInitializeApp,
  mockSendPushToUser,
  mockGetFirestore,
  mockCollectionGroup,
  mockWhere1,
  mockWhere2,
  mockGet,
} = vi.hoisted(() => ({
  mockInitializeApp: vi.fn(),
  mockSendPushToUser: vi.fn(async (_uid: string, _payload: unknown) => {}),
  mockGetFirestore: vi.fn(),
  mockCollectionGroup: vi.fn(),
  mockWhere1: vi.fn(),
  mockWhere2: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: () => mockInitializeApp(),
}));

vi.mock('./notificationHelpers', () => ({
  sendPushToUser: (uid: string, payload: unknown) => mockSendPushToUser(uid, payload),
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDocumentCreated: (_path: string, handler: any) => handler,
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSchedule: (_opts: unknown, handler: any) => handler,
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockGetFirestore(),
}));

import { onInboxCreated, onReminderDue } from './index';

// The vi.mock factories above replace onDocumentCreated/onSchedule with a
// pass-through that returns the raw handler, but TypeScript still infers the
// real CloudFunction/ScheduleFunction call signatures for the exports below.
// Cast to the plain async-function shape our mocks actually produce.
const inboxHandler = onInboxCreated as unknown as (event: unknown) => Promise<void>;
const reminderHandler = onReminderDue as unknown as () => Promise<void>;

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeInboxEvent(ownerUID: string, data: Record<string, unknown> | undefined) {
  return {
    params: { ownerUID },
    data: data === undefined ? undefined : { data: () => data },
  };
}

function makeReminderDoc(ownerUID: string | undefined, data: Record<string, unknown>) {
  return {
    data: () => data,
    ref: {
      parent: { parent: ownerUID ? { id: ownerUID } : null },
      update: vi.fn(async () => {}),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('onInboxCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when there is no document data', async () => {
    await inboxHandler(makeInboxEvent('owner-1', undefined));
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it('sends a push with the correct type and payload', async () => {
    await inboxHandler(
      makeInboxEvent('owner-1', { title: 'Buy milk', contributorEmail: 'partner@test.com' })
    );
    expect(mockSendPushToUser).toHaveBeenCalledWith('owner-1', {
      type: 'inbox',
      title: '📥 partner@test.com submitted a task',
      body: 'Buy milk',
    });
  });

  it('falls back to default title/contributor when fields are missing', async () => {
    await inboxHandler(makeInboxEvent('owner-1', {}));
    expect(mockSendPushToUser).toHaveBeenCalledWith('owner-1', {
      type: 'inbox',
      title: '📥 Someone submitted a task',
      body: 'New task submitted',
    });
  });
});

describe('onReminderDue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere2.mockReturnValue({ get: mockGet });
    mockWhere1.mockReturnValue({ where: mockWhere2 });
    mockCollectionGroup.mockReturnValue({ where: mockWhere1 });
    mockGetFirestore.mockReturnValue({ collectionGroup: mockCollectionGroup });
  });

  it('queries the reminders collection group for active, due reminders', async () => {
    mockGet.mockResolvedValue({ docs: [] });
    await reminderHandler();
    expect(mockCollectionGroup).toHaveBeenCalledWith('reminders');
    expect(mockWhere1).toHaveBeenCalledWith('active', '==', true);
    expect(mockWhere2).toHaveBeenCalledWith('nextDueDate', '<=', expect.any(Date));
  });

  it('sends a push for each due reminder', async () => {
    const doc = makeReminderDoc('owner-1', {
      title: 'Refill prescription',
      intervalDays: 35,
      nextDueDate: { toDate: () => new Date('2026-07-02') },
    });
    mockGet.mockResolvedValue({ docs: [doc] });
    await reminderHandler();
    expect(mockSendPushToUser).toHaveBeenCalledWith('owner-1', {
      type: 'reminder',
      title: '⏰ Refill prescription',
      body: 'This reminder is due today.',
    });
  });

  it('advances nextDueDate by intervalDays and sets lastFiredAt', async () => {
    const doc = makeReminderDoc('owner-1', {
      title: 'Refill prescription',
      intervalDays: 35,
      nextDueDate: { toDate: () => new Date('2026-07-02T00:00:00Z') },
    });
    mockGet.mockResolvedValue({ docs: [doc] });
    await reminderHandler();
    expect(doc.ref.update).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateArgs = (doc.ref.update as any).mock.calls[0][0];
    expect(updateArgs.nextDueDate.toISOString().slice(0, 10)).toBe('2026-08-06');
    expect(updateArgs.lastFiredAt).toBeInstanceOf(Date);
  });

  it('skips a reminder whose ownerUID cannot be resolved', async () => {
    const doc = makeReminderDoc(undefined, {
      title: 'Orphan reminder',
      intervalDays: 7,
      nextDueDate: { toDate: () => new Date() },
    });
    mockGet.mockResolvedValue({ docs: [doc] });
    await reminderHandler();
    expect(mockSendPushToUser).not.toHaveBeenCalled();
    expect(doc.ref.update).not.toHaveBeenCalled();
  });

  it('processes multiple due reminders independently', async () => {
    const doc1 = makeReminderDoc('owner-1', {
      title: 'A',
      intervalDays: 7,
      nextDueDate: { toDate: () => new Date('2026-07-01') },
    });
    const doc2 = makeReminderDoc('owner-2', {
      title: 'B',
      intervalDays: 14,
      nextDueDate: { toDate: () => new Date('2026-07-01') },
    });
    mockGet.mockResolvedValue({ docs: [doc1, doc2] });
    await reminderHandler();
    expect(mockSendPushToUser).toHaveBeenCalledTimes(2);
    expect(doc1.ref.update).toHaveBeenCalledOnce();
    expect(doc2.ref.update).toHaveBeenCalledOnce();
  });

  it('handles zero due reminders without error', async () => {
    mockGet.mockResolvedValue({ docs: [] });
    await expect(reminderHandler()).resolves.not.toThrow();
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });
});
