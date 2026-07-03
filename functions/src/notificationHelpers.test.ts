import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockGet, mockDelete, mockCollection, mockDoc, mockSendEachForMulticast } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockSendEachForMulticast: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (path: string) => {
      mockCollection(path);
      return { get: mockGet };
    },
    doc: (path: string) => {
      mockDoc(path);
      return { delete: () => mockDelete(path) };
    },
  }),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({
    sendEachForMulticast: (args: unknown) => mockSendEachForMulticast(args),
  }),
}));

import { sendPushToUser } from './notificationHelpers';

function makeTokenSnap(tokenIds: string[]) {
  return {
    empty: tokenIds.length === 0,
    docs: tokenIds.map((id) => ({ id })),
  };
}

describe('sendPushToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDelete.mockResolvedValue(undefined);
  });

  it('is a no-op when the owner has no registered tokens', async () => {
    mockGet.mockResolvedValue(makeTokenSnap([]));
    await sendPushToUser('owner-1', { type: 'inbox', title: 'Title', body: 'Body' });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('fetches tokens from the correct Firestore path', async () => {
    mockGet.mockResolvedValue(makeTokenSnap(['tok-1']));
    mockSendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });
    await sendPushToUser('owner-1', { type: 'reminder', title: 'T', body: 'B' });
    expect(mockCollection).toHaveBeenCalledWith('users/owner-1/fcmTokens');
  });

  it('sends a data-only multicast with the correct payload shape', async () => {
    mockGet.mockResolvedValue(makeTokenSnap(['tok-1', 'tok-2']));
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });
    await sendPushToUser('owner-1', { type: 'inbox', title: 'Hello', body: 'World' });
    expect(mockSendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['tok-1', 'tok-2'],
      data: {
        type: 'inbox',
        title: 'Hello',
        body: 'World',
        icon: '/icons/icon-192x192.png',
      },
    });
  });

  it('uses a custom icon when provided', async () => {
    mockGet.mockResolvedValue(makeTokenSnap(['tok-1']));
    mockSendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });
    await sendPushToUser('owner-1', { type: 'reminder', title: 'T', body: 'B', icon: '/custom.png' });
    const call = mockSendEachForMulticast.mock.lastCall?.[0] as { data: { icon: string } };
    expect(call.data.icon).toBe('/custom.png');
  });

  it('prunes tokens FCM reports as not-registered', async () => {
    mockGet.mockResolvedValue(makeTokenSnap(['tok-good', 'tok-stale']));
    mockSendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });
    await sendPushToUser('owner-1', { type: 'inbox', title: 'T', body: 'B' });
    expect(mockDoc).toHaveBeenCalledWith('users/owner-1/fcmTokens/tok-stale');
    expect(mockDelete).toHaveBeenCalledWith('users/owner-1/fcmTokens/tok-stale');
    expect(mockDelete).not.toHaveBeenCalledWith('users/owner-1/fcmTokens/tok-good');
  });

  it('prunes tokens FCM reports as invalid', async () => {
    mockGet.mockResolvedValue(makeTokenSnap(['tok-invalid']));
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ success: false, error: { code: 'messaging/invalid-registration-token' } }],
    });
    await sendPushToUser('owner-1', { type: 'inbox', title: 'T', body: 'B' });
    expect(mockDelete).toHaveBeenCalledWith('users/owner-1/fcmTokens/tok-invalid');
  });

  it('does not prune tokens that fail for other reasons', async () => {
    mockGet.mockResolvedValue(makeTokenSnap(['tok-1']));
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ success: false, error: { code: 'messaging/internal-error' } }],
    });
    await sendPushToUser('owner-1', { type: 'inbox', title: 'T', body: 'B' });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('does not delete anything when all sends succeed', async () => {
    mockGet.mockResolvedValue(makeTokenSnap(['tok-1']));
    mockSendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });
    await sendPushToUser('owner-1', { type: 'inbox', title: 'T', body: 'B' });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
