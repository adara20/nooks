import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

// ─── Hoist all mocks that are referenced inside vi.mock factories ─────────────
const {
  mockOnSnapshot,
  mockToast,
  mockGetAppMode,
  mockGetStoredOwnerUID,
  mockHasSeen,
  mockMarkSeen,
  mockUseAuth,
} = vi.hoisted(() => {
  const t = vi.fn() as Mock & { success: Mock; error: Mock };
  t.success = vi.fn();
  t.error = vi.fn();
  return {
    mockOnSnapshot: vi.fn(),
    mockToast: t,
    mockGetAppMode: vi.fn(),
    mockGetStoredOwnerUID: vi.fn(),
    mockHasSeen: vi.fn(),
    mockMarkSeen: vi.fn(),
    mockUseAuth: vi.fn(),
  };
});

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
    query: vi.fn((...args: unknown[]) => args[0]),
    where: vi.fn((...args: unknown[]) => args),
    onSnapshot: mockOnSnapshot,
  };
});

vi.mock('../services/firebaseService', () => ({
  firestore: {},
}));

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: mockToast,
}));

vi.mock('../services/contributorService', () => ({
  getAppMode: mockGetAppMode,
  getStoredOwnerUID: mockGetStoredOwnerUID,
}));

vi.mock('../services/notificationsSeenService', () => ({
  hasSeen: mockHasSeen,
  markSeen: mockMarkSeen,
}));

vi.mock('./AuthContext', () => ({
  useAuth: mockUseAuth,
}));

import { NotificationProvider } from './NotificationProvider';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(changes: Array<{ type: string; id: string; data: Record<string, unknown> }>, fromCache = false) {
  return {
    metadata: { fromCache },
    docChanges: () =>
      changes.map(c => ({
        type: c.type,
        doc: { id: c.id, data: () => c.data },
      })),
  };
}

function renderProvider() {
  return render(
    <NotificationProvider>
      <div data-testid="child" />
    </NotificationProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Explicitly clear toast sub-mocks — they're assigned via property so
    // vi.clearAllMocks() may not track them in all Vitest versions.
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    mockOnSnapshot.mockReturnValue(() => {}); // default: no-op unsubscribe
    mockHasSeen.mockResolvedValue(false);
    mockMarkSeen.mockResolvedValue(undefined);
  });

  describe('when user is not signed in', () => {
    it('does not start any listeners', () => {
      mockUseAuth.mockReturnValue({ user: null, isSignedIn: false });
      mockGetAppMode.mockReturnValue('owner');
      renderProvider();
      expect(mockOnSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('owner mode', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: { uid: 'owner-uid' }, isSignedIn: true });
      mockGetAppMode.mockReturnValue('owner');
    });

    it('starts the inbox listener', () => {
      renderProvider();
      expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    });

    it('shows a toast for a new inbox submission (second snapshot onwards)', async () => {
      let capturedCallback: ((snap: unknown) => void) | null = null;
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        capturedCallback = cb;
        return () => {};
      });

      renderProvider();

      // First snapshot is always skipped (initial collection state)
      await act(async () => {
        capturedCallback!(makeSnapshot([]));
      });

      // Second snapshot — this is a genuine new event
      await act(async () => {
        capturedCallback!(makeSnapshot([
          { type: 'added', id: 'inbox1', data: { contributorEmail: 'bob@example.com', title: 'Fix login bug' } },
        ]));
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith('📥 New submission from bob@example.com: "Fix login bug"');
      });
    });

    it('always skips the first snapshot (fromCache: true — cold start via cache)', async () => {
      let capturedCallback: ((snap: unknown) => void) | null = null;
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        capturedCallback = cb;
        return () => {};
      });

      renderProvider();

      await act(async () => {
        capturedCallback!(makeSnapshot([
          { type: 'added', id: 'inbox1', data: { contributorEmail: 'bob@example.com', title: 'Fix login bug' } },
        ], true /* fromCache */));
      });

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('always skips the first snapshot (fromCache: false — live server snapshot on open)', async () => {
      let capturedCallback: ((snap: unknown) => void) | null = null;
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        capturedCallback = cb;
        return () => {};
      });

      renderProvider();

      // This is the bug that was reported: existing docs arrive via a live server
      // snapshot (fromCache: false) on first load, but must still be suppressed.
      await act(async () => {
        capturedCallback!(makeSnapshot([
          { type: 'added', id: 'inbox1', data: { contributorEmail: 'bob@example.com', title: 'Old submission' } },
        ], false /* fromCache — live server snapshot */));
      });

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('skips already-seen events', async () => {
      mockHasSeen.mockResolvedValue(true);
      let capturedCallback: ((snap: unknown) => void) | null = null;
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        capturedCallback = cb;
        return () => {};
      });

      renderProvider();

      await act(async () => {
        capturedCallback!(makeSnapshot([
          { type: 'added', id: 'inbox1', data: { contributorEmail: 'bob@example.com', title: 'Fix login bug' } },
        ]));
      });

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('ignores non-added doc changes', async () => {
      let capturedCallback: ((snap: unknown) => void) | null = null;
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        capturedCallback = cb;
        return () => {};
      });

      renderProvider();

      await act(async () => {
        capturedCallback!(makeSnapshot([
          { type: 'modified', id: 'inbox1', data: { contributorEmail: 'bob@example.com', title: 'Fix login bug' } },
        ]));
      });

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('calls markSeen after showing a toast', async () => {
      let capturedCallback: ((snap: unknown) => void) | null = null;
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        capturedCallback = cb;
        return () => {};
      });

      renderProvider();

      // Skip first snapshot
      await act(async () => {
        capturedCallback!(makeSnapshot([]));
      });

      await act(async () => {
        capturedCallback!(makeSnapshot([
          { type: 'added', id: 'inbox42', data: { contributorEmail: 'bob@example.com', title: 'Do thing' } },
        ]));
      });

      await waitFor(() => {
        expect(mockMarkSeen).toHaveBeenCalledWith('inbox:created:inbox42');
      });
    });
  });

  describe('contributor mode', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: { uid: 'contributor-uid' }, isSignedIn: true });
      mockGetAppMode.mockReturnValue('contributor');
      mockGetStoredOwnerUID.mockReturnValue('owner-uid');
    });

    it('starts two listeners (inbox status + task status)', () => {
      renderProvider();
      expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    });

    it('starts no listeners when ownerUID is null', () => {
      mockGetStoredOwnerUID.mockReturnValue(null);
      renderProvider();
      expect(mockOnSnapshot).not.toHaveBeenCalled();
    });

    it('shows success toast when inbox is accepted (second snapshot onwards)', async () => {
      const callbacks: Array<(snap: unknown) => void> = [];
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        callbacks.push(cb);
        return () => {};
      });

      renderProvider();

      // Skip first snapshot for each listener
      await act(async () => {
        callbacks[0]!(makeSnapshot([]));
        callbacks[1]!(makeSnapshot([]));
      });

      await act(async () => {
        callbacks[0]!(makeSnapshot([
          { type: 'modified', id: 'inbox1', data: { status: 'accepted', title: 'My task' } },
        ]));
      });

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('✅ Your submission "My task" was accepted');
      });
    });

    it('shows error toast when inbox is declined (second snapshot onwards)', async () => {
      const callbacks: Array<(snap: unknown) => void> = [];
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        callbacks.push(cb);
        return () => {};
      });

      renderProvider();

      await act(async () => {
        callbacks[0]!(makeSnapshot([]));
        callbacks[1]!(makeSnapshot([]));
      });

      await act(async () => {
        callbacks[0]!(makeSnapshot([
          { type: 'modified', id: 'inbox1', data: { status: 'declined', title: 'My task' } },
        ]));
      });

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('❌ Your submission "My task" was declined');
      });
    });

    it('shows toast when task status changes (second snapshot onwards)', async () => {
      const callbacks: Array<(snap: unknown) => void> = [];
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        callbacks.push(cb);
        return () => {};
      });

      renderProvider();

      await act(async () => {
        callbacks[0]!(makeSnapshot([]));
        callbacks[1]!(makeSnapshot([]));
      });

      await act(async () => {
        callbacks[1]!(makeSnapshot([
          { type: 'modified', id: 'task1', data: { status: 'in-progress', title: 'Build feature' } },
        ]));
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith('🔄 Your task "Build feature" is now In Progress');
      });
    });

    it('shows success toast when task status becomes done (second snapshot onwards)', async () => {
      const callbacks: Array<(snap: unknown) => void> = [];
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        callbacks.push(cb);
        return () => {};
      });

      renderProvider();

      await act(async () => {
        callbacks[0]!(makeSnapshot([]));
        callbacks[1]!(makeSnapshot([]));
      });

      await act(async () => {
        callbacks[1]!(makeSnapshot([
          { type: 'modified', id: 'task1', data: { status: 'done', title: 'Build feature' } },
        ]));
      });

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('🔄 Your task "Build feature" is now Done ✓');
      });
    });

    it('skips inbox status changes that are not accepted or declined', async () => {
      const callbacks: Array<(snap: unknown) => void> = [];
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        callbacks.push(cb);
        return () => {};
      });

      renderProvider();

      // Skip first snapshots
      await act(async () => {
        callbacks[0]!(makeSnapshot([]));
        callbacks[1]!(makeSnapshot([]));
      });

      await act(async () => {
        callbacks[0]!(makeSnapshot([
          { type: 'modified', id: 'inbox1', data: { status: 'pending', title: 'My task' } },
        ]));
      });

      expect(mockToast).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('always skips the first snapshot (fromCache: true)', async () => {
      const callbacks: Array<(snap: unknown) => void> = [];
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        callbacks.push(cb);
        return () => {};
      });

      renderProvider();

      await act(async () => {
        callbacks[0]!(makeSnapshot([
          { type: 'modified', id: 'inbox1', data: { status: 'accepted', title: 'My task' } },
        ], true /* fromCache */));
      });

      expect(mockToast.success).not.toHaveBeenCalled();
    });

    it('always skips the first snapshot (fromCache: false — live server snapshot)', async () => {
      const callbacks: Array<(snap: unknown) => void> = [];
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        callbacks.push(cb);
        return () => {};
      });

      renderProvider();

      await act(async () => {
        callbacks[0]!(makeSnapshot([
          { type: 'modified', id: 'inbox1', data: { status: 'accepted', title: 'Old submission' } },
        ], false /* fromCache — live server, the bug case */));
      });

      expect(mockToast.success).not.toHaveBeenCalled();
    });
  });

  describe('humanReadableStatus mapping', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: { uid: 'contributor-uid' }, isSignedIn: true });
      mockGetAppMode.mockReturnValue('contributor');
      mockGetStoredOwnerUID.mockReturnValue('owner-uid');
    });

    const statusCases: Array<[string, string]> = [
      ['todo', 'To Do'],
      ['in-progress', 'In Progress'],
      ['done', 'Done ✓'],
      ['backlog', 'Backlog'],
    ];

    it.each(statusCases)('maps status "%s" to "%s"', async (status, label) => {
      const callbacks: Array<(snap: unknown) => void> = [];
      mockOnSnapshot.mockImplementation((_ref: unknown, _opts: unknown, cb: (snap: unknown) => void) => {
        callbacks.push(cb);
        return () => {};
      });

      renderProvider();

      // Skip first snapshots
      await act(async () => {
        callbacks[0]!(makeSnapshot([]));
        callbacks[1]!(makeSnapshot([]));
      });

      await act(async () => {
        callbacks[1]!(makeSnapshot([
          { type: 'modified', id: 'task1', data: { status, title: 'My task' } },
        ]));
      });

      await waitFor(() => {
        if (status === 'done') {
          expect(mockToast.success).toHaveBeenCalledWith(`🔄 Your task "My task" is now ${label}`);
        } else {
          expect(mockToast).toHaveBeenCalledWith(`🔄 Your task "My task" is now ${label}`);
        }
      });
    });
  });
});
