import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock functions (safe to reference inside vi.mock factories) ──────

const {
  mockCreateUser,
  mockSignIn,
  mockSignOut,
  mockOnAuthStateChanged,
  mockInitializeApp,
  mockGetAuth,
  mockGetFirestore,
} = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignOut: vi.fn(),
  mockOnAuthStateChanged: vi.fn(),
  mockInitializeApp: vi.fn(() => ({})),
  mockGetAuth: vi.fn(() => ({ currentUser: null })),
  mockGetFirestore: vi.fn(() => ({})),
}));

// ─── Mock Firebase modules ────────────────────────────────────────────────────

vi.mock('firebase/app', () => ({
  initializeApp: () => mockInitializeApp(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => mockGetAuth(),
  createUserWithEmailAndPassword: (_auth: unknown, email: string, password: string) =>
    mockCreateUser(email, password),
  signInWithEmailAndPassword: (_auth: unknown, email: string, password: string) =>
    mockSignIn(email, password),
  signOut: () => mockSignOut(),
  onAuthStateChanged: (_auth: unknown, cb: unknown) => mockOnAuthStateChanged(cb),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: () => mockGetFirestore(),
}));

// Import after mocks are set up
import {
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  onAuthChange,
} from './firebaseService';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('firebaseService — auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockReturnValue({ currentUser: null });
    mockGetFirestore.mockReturnValue({});
    mockInitializeApp.mockReturnValue({});
    mockCreateUser.mockResolvedValue({ user: { email: 'test@test.com' } });
    mockSignIn.mockResolvedValue({ user: { email: 'test@test.com' } });
    mockSignOut.mockResolvedValue(undefined);
    mockOnAuthStateChanged.mockReturnValue(vi.fn());
  });

  describe('signUpWithEmail', () => {
    it('calls createUserWithEmailAndPassword with email and password', async () => {
      await signUpWithEmail('user@test.com', 'password123');
      expect(mockCreateUser).toHaveBeenCalledWith('user@test.com', 'password123');
    });

    it('propagates errors from Firebase', async () => {
      mockCreateUser.mockRejectedValue(new Error('auth/email-already-in-use'));
      await expect(signUpWithEmail('taken@test.com', 'pass')).rejects.toThrow('auth/email-already-in-use');
    });
  });

  describe('signInWithEmail', () => {
    it('calls signInWithEmailAndPassword with email and password', async () => {
      await signInWithEmail('user@test.com', 'password123');
      expect(mockSignIn).toHaveBeenCalledWith('user@test.com', 'password123');
    });

    it('propagates errors from Firebase', async () => {
      mockSignIn.mockRejectedValue(new Error('auth/wrong-password'));
      await expect(signInWithEmail('user@test.com', 'wrong')).rejects.toThrow('auth/wrong-password');
    });
  });

  describe('signOutUser', () => {
    it('calls Firebase signOut', async () => {
      await signOutUser();
      expect(mockSignOut).toHaveBeenCalledOnce();
    });

    it('propagates errors from Firebase', async () => {
      mockSignOut.mockRejectedValue(new Error('network-error'));
      await expect(signOutUser()).rejects.toThrow('network-error');
    });
  });

  describe('onAuthChange', () => {
    it('calls onAuthStateChanged with the provided callback', () => {
      const cb = vi.fn();
      onAuthChange(cb);
      expect(mockOnAuthStateChanged).toHaveBeenCalledWith(cb);
    });

    it('returns the unsubscribe function from onAuthStateChanged', () => {
      const unsubscribe = vi.fn();
      mockOnAuthStateChanged.mockReturnValue(unsubscribe);
      const result = onAuthChange(vi.fn());
      expect(result).toBe(unsubscribe);
    });
  });
});
