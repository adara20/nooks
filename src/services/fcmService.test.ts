import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const {
  mockIsSupported,
  mockGetToken,
  mockGetMessaging,
  mockSetDoc,
  mockDoc,
  mockServerTimestamp,
  mockAuth,
} = vi.hoisted(() => ({
  mockIsSupported: vi.fn(),
  mockGetToken: vi.fn(),
  mockGetMessaging: vi.fn(() => ({})),
  mockSetDoc: vi.fn(),
  mockDoc: vi.fn(() => ({})),
  mockServerTimestamp: vi.fn(() => 'mock-timestamp'),
  // auth is a module-level constant in firebaseService — mock the whole module
  mockAuth: { currentUser: null as { uid: string } | null },
}));

// Mock firebaseService directly so auth/firestore/app are under test control
vi.mock('./firebaseService', () => ({
  app: {},
  auth: mockAuth,
  firestore: {},
}));

vi.mock('firebase/messaging', () => ({
  getMessaging: mockGetMessaging,
  getToken: mockGetToken,
  isSupported: mockIsSupported,
}));

vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
  serverTimestamp: mockServerTimestamp,
}));

import {
  isFcmSupported,
  getNotificationPermission,
  requestPermissionAndSaveToken,
} from './fcmService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setNotificationPermission(permission: NotificationPermission) {
  Object.defineProperty(globalThis, 'Notification', {
    value: { permission, requestPermission: vi.fn().mockResolvedValue(permission) },
    writable: true,
    configurable: true,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fcmService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = null;
    mockSetDoc.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue('mock-fcm-token');
    mockGetMessaging.mockReturnValue({});
    mockServerTimestamp.mockReturnValue('mock-timestamp');
    setNotificationPermission('default');
  });

  describe('isFcmSupported', () => {
    it('returns true when isSupported resolves true', async () => {
      mockIsSupported.mockResolvedValue(true);
      expect(await isFcmSupported()).toBe(true);
    });

    it('returns false when isSupported resolves false', async () => {
      mockIsSupported.mockResolvedValue(false);
      expect(await isFcmSupported()).toBe(false);
    });
  });

  describe('getNotificationPermission', () => {
    it('returns the current Notification.permission value', () => {
      setNotificationPermission('granted');
      expect(getNotificationPermission()).toBe('granted');
    });

    it('returns denied when Notification is undefined', () => {
      const original = globalThis.Notification;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).Notification;
      expect(getNotificationPermission()).toBe('denied');
      globalThis.Notification = original;
    });
  });

  describe('requestPermissionAndSaveToken', () => {
    it('returns null when user is not signed in', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockAuth.currentUser = null;
      setNotificationPermission('granted');

      const result = await requestPermissionAndSaveToken();
      expect(result).toBeNull();
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('returns null when FCM is not supported', async () => {
      mockIsSupported.mockResolvedValue(false);
      mockAuth.currentUser = { uid: 'user-1' };

      const result = await requestPermissionAndSaveToken();
      expect(result).toBeNull();
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('returns null when notification permission is denied', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockAuth.currentUser = { uid: 'user-1' };
      setNotificationPermission('denied');

      const result = await requestPermissionAndSaveToken();
      expect(result).toBeNull();
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('returns null when getToken returns an empty string', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockAuth.currentUser = { uid: 'user-1' };
      setNotificationPermission('granted');
      mockGetToken.mockResolvedValue('');

      const result = await requestPermissionAndSaveToken();
      expect(result).toBeNull();
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('stores the token in Firestore and returns it on success', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockAuth.currentUser = { uid: 'user-1' };
      setNotificationPermission('granted');
      mockGetToken.mockResolvedValue('valid-fcm-token');

      const result = await requestPermissionAndSaveToken();

      expect(result).toBe('valid-fcm-token');
      expect(mockSetDoc).toHaveBeenCalledOnce();
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          token: 'valid-fcm-token',
          createdAt: 'mock-timestamp',
        })
      );
    });

    it('returns null and does not throw if getToken throws', async () => {
      mockIsSupported.mockResolvedValue(true);
      mockAuth.currentUser = { uid: 'user-1' };
      setNotificationPermission('granted');
      mockGetToken.mockRejectedValue(new Error('SW not registered'));

      const result = await requestPermissionAndSaveToken();
      expect(result).toBeNull();
    });
  });
});
