import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { repository } from '../services/repository';

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockOnAuthChange,
  mockSignInWithEmail,
  mockSignUpWithEmail,
  mockSignOutUser,
  mockRunInitialSync,
} = vi.hoisted(() => ({
  mockOnAuthChange: vi.fn(),
  mockSignInWithEmail: vi.fn(),
  mockSignUpWithEmail: vi.fn(),
  mockSignOutUser: vi.fn(),
  mockRunInitialSync: vi.fn(),
}));

vi.mock('../services/firebaseService', () => ({
  onAuthChange: (cb: (user: unknown) => void) => mockOnAuthChange(cb),
  signInWithEmail: (email: string, password: string) => mockSignInWithEmail(email, password),
  signUpWithEmail: (email: string, password: string) => mockSignUpWithEmail(email, password),
  signOutUser: () => mockSignOutUser(),
  runInitialSync: (uid: string, callbacks: unknown) => mockRunInitialSync(uid, callbacks),
}));

vi.mock('../services/repository', () => ({
  repository: {
    getAllBuckets: vi.fn(async () => []),
    getAllTasks: vi.fn(async () => []),
    addBucket: vi.fn(async () => 1),
    addTask: vi.fn(async () => 1),
  },
}));

// ─── Test consumer component ──────────────────────────────────────────────────

const TestConsumer: React.FC<{
  onSignIn?: () => void;
  onSignUp?: () => void;
  onSignOut?: () => void;
}> = ({ onSignIn, onSignUp, onSignOut }) => {
  const { user, isSignedIn, authLoading, syncStatus, signIn, signUp, signOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(authLoading)}</span>
      <span data-testid="signed-in">{String(isSignedIn)}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
      <span data-testid="sync-status">{syncStatus}</span>
      <button onClick={() => { signIn('a@b.com', 'pass'); onSignIn?.(); }}>Sign In</button>
      <button onClick={() => { signUp('a@b.com', 'pass'); onSignUp?.(); }}>Sign Up</button>
      <button onClick={() => { signOut(); onSignOut?.(); }}>Sign Out</button>
    </div>
  );
};

function renderWithAuth(ui = <TestConsumer />) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: onAuthChange holds the callback, does not call it yet
    mockOnAuthChange.mockImplementation(() => vi.fn()); // returns unsubscribe
    mockSignInWithEmail.mockResolvedValue({});
    mockSignUpWithEmail.mockResolvedValue({});
    mockSignOutUser.mockResolvedValue(undefined);
    mockRunInitialSync.mockResolvedValue(undefined);
  });

  it('authLoading is true before onAuthStateChanged fires', () => {
    renderWithAuth();
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('authLoading becomes false after onAuthStateChanged fires with null', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: null) => void) => {
      cb(null);
      return vi.fn();
    });
    renderWithAuth();
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
  });

  it('isSignedIn is false when user is null', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: null) => void) => {
      cb(null);
      return vi.fn();
    });
    renderWithAuth();
    await waitFor(() => {
      expect(screen.getByTestId('signed-in').textContent).toBe('false');
    });
  });

  it('isSignedIn is true when user is present', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: { email: string; uid: string }) => void) => {
      cb({ email: 'test@test.com', uid: 'uid-1' });
      return vi.fn();
    });
    renderWithAuth();
    await waitFor(() => {
      expect(screen.getByTestId('signed-in').textContent).toBe('true');
      expect(screen.getByTestId('email').textContent).toBe('test@test.com');
    });
  });

  it('unsubscribes from onAuthStateChanged on unmount', () => {
    const unsubscribe = vi.fn();
    mockOnAuthChange.mockImplementation((cb: (u: null) => void) => {
      cb(null);
      return unsubscribe;
    });
    const { unmount } = renderWithAuth();
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('signIn calls signInWithEmail with correct args', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: null) => void) => { cb(null); return vi.fn(); });
    renderWithAuth();
    await userEvent.click(screen.getByText('Sign In'));
    expect(mockSignInWithEmail).toHaveBeenCalledWith('a@b.com', 'pass');
  });

  it('signUp calls signUpWithEmail with correct args', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: null) => void) => { cb(null); return vi.fn(); });
    renderWithAuth();
    await userEvent.click(screen.getByText('Sign Up'));
    expect(mockSignUpWithEmail).toHaveBeenCalledWith('a@b.com', 'pass');
  });

  it('signOut calls signOutUser', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: null) => void) => { cb(null); return vi.fn(); });
    renderWithAuth();
    await userEvent.click(screen.getByText('Sign Out'));
    expect(mockSignOutUser).toHaveBeenCalledOnce();
  });

  it('signOut resets syncStatus to idle', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: null) => void) => { cb(null); return vi.fn(); });
    const SetSyncStatus: React.FC = () => {
      const { syncStatus, setSyncStatus, signOut } = useAuth();
      return (
        <div>
          <span data-testid="sync-status">{syncStatus}</span>
          <button onClick={() => setSyncStatus('synced')}>Set Synced</button>
          <button onClick={signOut}>Sign Out</button>
        </div>
      );
    };
    renderWithAuth(<SetSyncStatus />);
    await userEvent.click(screen.getByText('Set Synced'));
    expect(screen.getByTestId('sync-status').textContent).toBe('synced');
    await userEvent.click(screen.getByText('Sign Out'));
    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toBe('idle');
    });
  });

  it('throws if useAuth is used outside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });

  it('syncStatus starts as idle', async () => {
    mockOnAuthChange.mockImplementation((cb: (u: null) => void) => { cb(null); return vi.fn(); });
    renderWithAuth();
    await waitFor(() => {
      expect(screen.getByTestId('sync-status').textContent).toBe('idle');
    });
  });

  // ─── Initial sync tests ──────────────────────────────────────────────────────

  describe('initial sync on sign-in', () => {
    it('calls runInitialSync with the signed-in user uid', async () => {
      mockOnAuthChange.mockImplementation((cb: (u: { uid: string; email: string }) => void) => {
        cb({ uid: 'uid-abc', email: 'user@test.com' });
        return vi.fn();
      });
      renderWithAuth();
      await waitFor(() => {
        expect(mockRunInitialSync).toHaveBeenCalledWith('uid-abc', expect.any(Object));
      });
    });

    it('sets syncStatus to syncing then synced on success', async () => {
      mockOnAuthChange.mockImplementation((cb: (u: { uid: string; email: string }) => void) => {
        cb({ uid: 'uid-abc', email: 'user@test.com' });
        return vi.fn();
      });
      renderWithAuth();
      await waitFor(() => {
        expect(screen.getByTestId('sync-status').textContent).toBe('synced');
      });
    });

    it('sets syncStatus to error when runInitialSync rejects', async () => {
      mockRunInitialSync.mockRejectedValue(new Error('network error'));
      mockOnAuthChange.mockImplementation((cb: (u: { uid: string; email: string }) => void) => {
        cb({ uid: 'uid-abc', email: 'user@test.com' });
        return vi.fn();
      });
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      renderWithAuth();
      await waitFor(() => {
        expect(screen.getByTestId('sync-status').textContent).toBe('error');
      });
      consoleWarn.mockRestore();
    });

    it('does not call runInitialSync when user is null', async () => {
      mockOnAuthChange.mockImplementation((cb: (u: null) => void) => {
        cb(null);
        return vi.fn();
      });
      renderWithAuth();
      await waitFor(() => {
        expect(screen.getByTestId('loading').textContent).toBe('false');
      });
      expect(mockRunInitialSync).not.toHaveBeenCalled();
    });

    it('does not call runInitialSync twice for the same uid', async () => {
      let capturedCb: ((u: { uid: string; email: string } | null) => void) | null = null;
      mockOnAuthChange.mockImplementation((cb: (u: { uid: string; email: string } | null) => void) => {
        capturedCb = cb;
        cb({ uid: 'uid-abc', email: 'user@test.com' });
        return vi.fn();
      });
      renderWithAuth();
      await waitFor(() => {
        expect(mockRunInitialSync).toHaveBeenCalledOnce();
      });
      // Fire the auth change again with the same uid
      capturedCb!({ uid: 'uid-abc', email: 'user@test.com' });
      await waitFor(() => {
        expect(mockRunInitialSync).toHaveBeenCalledOnce(); // still only once
      });
    });
  });

  // ─── Callback body tests ─────────────────────────────────────────────────────

  describe('runInitialSync callback bodies', () => {
    type Callbacks = Parameters<typeof mockRunInitialSync>[1];

    function setupAndCaptureCallbacks(): Promise<Callbacks> {
      return new Promise((resolve) => {
        mockRunInitialSync.mockImplementation(async (_uid: string, cbs: Callbacks) => {
          resolve(cbs);
        });
        mockOnAuthChange.mockImplementation((cb: (u: { uid: string; email: string }) => void) => {
          cb({ uid: 'uid-cb', email: 'cb@test.com' });
          return vi.fn();
        });
        renderWithAuth();
      });
    }

    it('getLocalData calls repository.getAllBuckets and getAllTasks', async () => {
      const cbs = await setupAndCaptureCallbacks();
      vi.mocked(repository.getAllBuckets).mockResolvedValue([]);
      vi.mocked(repository.getAllTasks).mockResolvedValue([]);
      await cbs.getLocalData();
      expect(vi.mocked(repository.getAllBuckets)).toHaveBeenCalled();
      expect(vi.mocked(repository.getAllTasks)).toHaveBeenCalled();
    });

    it('getLocalData returns buckets and tasks from repository', async () => {
      const fakeBuckets = [{ id: 1, name: 'Work', emoji: '💼', createdAt: new Date() }];
      const fakeTasks = [{ id: 1, title: 'Do thing', status: 'todo' as const, isUrgent: false, isImportant: false, createdAt: new Date() }];
      const cbs = await setupAndCaptureCallbacks();
      vi.mocked(repository.getAllBuckets).mockResolvedValue(fakeBuckets);
      vi.mocked(repository.getAllTasks).mockResolvedValue(fakeTasks);
      const result = await cbs.getLocalData();
      expect(result.buckets).toEqual(fakeBuckets);
      expect(result.tasks).toEqual(fakeTasks);
    });

    it('insertMergedItems calls addBucket for each bucket', async () => {
      const cbs = await setupAndCaptureCallbacks();
      const bucketsToInsert = [
        { name: 'Home', emoji: '🏠', createdAt: new Date() },
        { name: 'Work', emoji: '💼', createdAt: new Date() },
      ];
      await cbs.insertMergedItems({ buckets: bucketsToInsert, tasks: [] });
      expect(vi.mocked(repository.addBucket)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(repository.addBucket)).toHaveBeenCalledWith(bucketsToInsert[0]);
      expect(vi.mocked(repository.addBucket)).toHaveBeenCalledWith(bucketsToInsert[1]);
    });

    it('insertMergedItems calls addTask for each task', async () => {
      const cbs = await setupAndCaptureCallbacks();
      const tasksToInsert = [
        { title: 'Task A', status: 'todo' as const, isUrgent: false, isImportant: false, createdAt: new Date() },
        { title: 'Task B', status: 'todo' as const, isUrgent: true, isImportant: true, createdAt: new Date() },
      ];
      await cbs.insertMergedItems({ buckets: [], tasks: tasksToInsert });
      expect(vi.mocked(repository.addTask)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(repository.addTask)).toHaveBeenCalledWith(tasksToInsert[0]);
      expect(vi.mocked(repository.addTask)).toHaveBeenCalledWith(tasksToInsert[1]);
    });

    it('insertMergedItems calls both addBucket and addTask when both lists are non-empty', async () => {
      const cbs = await setupAndCaptureCallbacks();
      await cbs.insertMergedItems({
        buckets: [{ name: 'X', emoji: '✨', createdAt: new Date() }],
        tasks: [{ title: 'Y', status: 'todo' as const, isUrgent: false, isImportant: false, createdAt: new Date() }],
      });
      expect(vi.mocked(repository.addBucket)).toHaveBeenCalledOnce();
      expect(vi.mocked(repository.addTask)).toHaveBeenCalledOnce();
    });

    it('insertMergedItems does nothing when both lists are empty', async () => {
      const cbs = await setupAndCaptureCallbacks();
      await cbs.insertMergedItems({ buckets: [], tasks: [] });
      expect(vi.mocked(repository.addBucket)).not.toHaveBeenCalled();
      expect(vi.mocked(repository.addTask)).not.toHaveBeenCalled();
    });

    it('getAllLocalData calls repository.getAllBuckets and getAllTasks', async () => {
      const cbs = await setupAndCaptureCallbacks();
      vi.mocked(repository.getAllBuckets).mockResolvedValue([]);
      vi.mocked(repository.getAllTasks).mockResolvedValue([]);
      await cbs.getAllLocalData();
      expect(vi.mocked(repository.getAllBuckets)).toHaveBeenCalled();
      expect(vi.mocked(repository.getAllTasks)).toHaveBeenCalled();
    });

    it('getAllLocalData returns the current repository state', async () => {
      const fakeBuckets = [{ id: 2, name: 'Personal', emoji: '🏡', createdAt: new Date() }];
      const fakeTasks = [{ id: 2, title: 'Read book', status: 'todo' as const, isUrgent: false, isImportant: true, createdAt: new Date() }];
      const cbs = await setupAndCaptureCallbacks();
      vi.mocked(repository.getAllBuckets).mockResolvedValue(fakeBuckets);
      vi.mocked(repository.getAllTasks).mockResolvedValue(fakeTasks);
      const result = await cbs.getAllLocalData();
      expect(result.buckets).toEqual(fakeBuckets);
      expect(result.tasks).toEqual(fakeTasks);
    });
  });
});
