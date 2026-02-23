import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';

// ─── Mock firebaseService ─────────────────────────────────────────────────────

const mockOnAuthChange = vi.fn();
const mockSignInWithEmail = vi.fn();
const mockSignUpWithEmail = vi.fn();
const mockSignOutUser = vi.fn();

vi.mock('../services/firebaseService', () => ({
  onAuthChange: (cb: (user: unknown) => void) => mockOnAuthChange(cb),
  signInWithEmail: (...args: unknown[]) => mockSignInWithEmail(...args),
  signUpWithEmail: (...args: unknown[]) => mockSignUpWithEmail(...args),
  signOutUser: () => mockSignOutUser(),
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
    mockOnAuthChange.mockImplementation((cb: (u: { email: string }) => void) => {
      cb({ email: 'test@test.com' });
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
});
