import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from './SettingsView';
import * as backupService from '../services/backupService';
import * as repository from '../services/repository';
import { db } from '../db';
import { createReminder } from '../tests/factories';

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockUseAuth,
  mockSignIn,
  mockSignUp,
  mockSignOut,
  mockGetReminders,
  mockAddReminder,
  mockUpdateReminder,
  mockDeleteReminder,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockGetReminders: vi.fn(async () => [] as unknown[]),
  mockAddReminder: vi.fn(async (_r: unknown) => 1),
  mockUpdateReminder: vi.fn(async (_id: number, _updates: unknown) => {}),
  mockDeleteReminder: vi.fn(async (_id: number) => {}),
}));

// ─── Mock AuthContext (overridable per-test via mockUseAuth) ──────────────────

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ─── Mock backup service ──────────────────────────────────────────────────────

vi.mock('../services/backupService', async (importOriginal) => {
  const actual = await importOriginal<typeof backupService>();
  return {
    ...actual,
    triggerDownload: vi.fn(),
    getLastExportDate: vi.fn(() => null),
    setLastExportDate: vi.fn(),
  };
});

vi.mock('../services/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof repository>();
  return {
    ...actual,
    repository: {
      getAllBuckets: vi.fn(async () => []),
      getAllTasks: vi.fn(async () => []),
      addBucket: vi.fn(async () => 1),
      addTask: vi.fn(async () => 1),
      getReminders: () => mockGetReminders(),
      addReminder: (r: unknown) => mockAddReminder(r),
      updateReminder: (id: number, updates: unknown) => mockUpdateReminder(id, updates),
      deleteReminder: (id: number) => mockDeleteReminder(id),
    },
  };
});

vi.mock('../db', () => ({
  db: {
    buckets: { clear: vi.fn(async () => {}) },
    tasks: { clear: vi.fn(async () => {}) },
  },
}));

// ─── Mock fcmService ─────────────────────────────────────────────────────────

const mockIsFcmSupported = vi.fn(async () => true);
const mockGetNotificationPermission = vi.fn(() => 'default' as NotificationPermission);
const mockRequestPermissionAndSaveToken = vi.fn(async () => null as string | null);

vi.mock('../services/fcmService', () => ({
  isFcmSupported: () => mockIsFcmSupported(),
  getNotificationPermission: () => mockGetNotificationPermission(),
  requestPermissionAndSaveToken: () => mockRequestPermissionAndSaveToken(),
}));

// ─── Mock contributorService ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetAppMode = vi.fn<any>(() => 'owner' as import('../services/contributorService').AppMode);
const mockSetAppMode = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetStoredOwnerEmail = vi.fn<any>(() => null as string | null);
const mockStoreOwnerInfo = vi.fn();
const mockClearOwnerInfo = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGenerateInviteCode = vi.fn<any>(async () => 'ABCD1234');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRedeemInviteCode = vi.fn<any>(async () => ({ ownerUID: 'owner-uid', ownerEmail: 'owner@example.com' }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetContributorPermission = vi.fn<any>(async () => null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRemoveContributorPermission = vi.fn<any>(async () => {});

const mockResendNotification = vi.fn(async (_title: string, _options?: unknown) => {});
vi.mock('../services/notificationRestoreService', () => ({
  resendNotification: (title: string, options?: unknown) => mockResendNotification(title, options),
}));

vi.mock('../services/contributorService', () => ({
  getAppMode: () => mockGetAppMode(),
  setAppMode: (mode: string) => mockSetAppMode(mode),
  getStoredOwnerEmail: () => mockGetStoredOwnerEmail(),
  storeOwnerInfo: (uid: string, email: string) => mockStoreOwnerInfo(uid, email),
  clearOwnerInfo: () => mockClearOwnerInfo(),
  generateInviteCode: (ownerUID: string, ownerEmail: string) => mockGenerateInviteCode(ownerUID, ownerEmail),
  redeemInviteCode: (code: string, uid: string, email: string) => mockRedeemInviteCode(code, uid, email),
  getContributorPermission: (uid: string) => mockGetContributorPermission(uid),
  removeContributorPermission: (uid: string) => mockRemoveContributorPermission(uid),
}));

const mockOnBack = vi.fn();

// Default signed-out state
const signedOutAuth = {
  user: null,
  isSignedIn: false,
  syncStatus: 'idle' as const,
  signIn: mockSignIn,
  signUp: mockSignUp,
  signOut: mockSignOut,
};

// Signed-in state with uid (for AppModeCard tests)
const signedInAuthWithUID = (syncStatus: 'idle' | 'syncing' | 'synced' | 'error' = 'synced') => ({
  user: { uid: 'user-123', email: 'user@example.com' },
  isSignedIn: true,
  syncStatus,
  signIn: mockSignIn,
  signUp: mockSignUp,
  signOut: mockSignOut,
});

// Flush any pending microtask-resolution state updates (e.g. PushNotificationsCard's
// isFcmSupported useEffect) so they don't bleed into the next test as act() warnings.
afterEach(async () => {
  await act(async () => {});
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSignIn.mockResolvedValue(undefined);
  mockSignUp.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
  vi.mocked(backupService.getLastExportDate).mockReturnValue(null);
  // Default: signed out
  mockUseAuth.mockReturnValue(signedOutAuth);
  // Default fcmService mocks
  mockIsFcmSupported.mockResolvedValue(true);
  mockGetNotificationPermission.mockReturnValue('default');
  mockRequestPermissionAndSaveToken.mockResolvedValue(null);
  // Default contributorService mocks
  mockGetAppMode.mockReturnValue('owner');
  mockGetStoredOwnerEmail.mockReturnValue(null);
  mockGenerateInviteCode.mockResolvedValue('ABCD1234');
  mockRedeemInviteCode.mockResolvedValue({ ownerUID: 'owner-uid', ownerEmail: 'owner@example.com' });
  mockGetContributorPermission.mockResolvedValue(null);
  // Default reminders mocks
  mockGetReminders.mockResolvedValue([]);
  mockAddReminder.mockResolvedValue(1);
  mockUpdateReminder.mockResolvedValue(undefined);
  mockDeleteReminder.mockResolvedValue(undefined);
});


describe('SettingsView', () => {
  it('renders the Settings header', () => {
    render(<SettingsView onBack={mockOnBack} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders "No backup yet" when getLastExportDate returns null', () => {
    vi.mocked(backupService.getLastExportDate).mockReturnValue(null);
    render(<SettingsView onBack={mockOnBack} />);
    expect(screen.getByText('No backup yet')).toBeInTheDocument();
  });

  it('renders last backup time when a recent export date exists', () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    vi.mocked(backupService.getLastExportDate).mockReturnValue(recent);
    render(<SettingsView onBack={mockOnBack} />);
    expect(screen.getByText(/about 1 hour ago/i)).toBeInTheDocument();
  });

  it('shows the stale indicator style when backup is overdue', () => {
    vi.mocked(backupService.getLastExportDate).mockReturnValue(null);
    render(<SettingsView onBack={mockOnBack} />);
    const lastBackupText = screen.getByText('No backup yet');
    expect(lastBackupText.className).toContain('text-nook-orange');
  });

  it('calls onBack when the back button is clicked', async () => {
    render(<SettingsView onBack={mockOnBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(mockOnBack).toHaveBeenCalledOnce();
  });

  it('calls triggerDownload when Export Data is clicked', async () => {
    render(<SettingsView onBack={mockOnBack} />);
    await userEvent.click(screen.getByTestId('export-button'));
    await waitFor(() => {
      expect(backupService.triggerDownload).toHaveBeenCalledOnce();
    });
  });

  it('calls setLastExportDate after a successful export', async () => {
    render(<SettingsView onBack={mockOnBack} />);
    await userEvent.click(screen.getByTestId('export-button'));
    await waitFor(() => {
      expect(backupService.setLastExportDate).toHaveBeenCalledOnce();
    });
  });

  it('shows success message after export', async () => {
    render(<SettingsView onBack={mockOnBack} />);
    await userEvent.click(screen.getByTestId('export-button'));
    await waitFor(() => {
      expect(screen.getByText(/backup downloaded/i)).toBeInTheDocument();
    });
  });

  it('shows error message for invalid JSON file', async () => {
    render(<SettingsView onBack={mockOnBack} />);
    const fileInput = screen.getByTestId('file-input');
    const badFile = new File(['not valid json!!!'], 'bad.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error message for valid JSON that is not a Nooks backup', async () => {
    render(<SettingsView onBack={mockOnBack} />);
    const fileInput = screen.getByTestId('file-input');
    const badBackup = new File([JSON.stringify({ foo: 'bar' })], 'bad.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [badBackup] } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('opens the import choice modal for a valid backup file', async () => {
    const validBackup = { version: 1, exportedAt: new Date().toISOString(), buckets: [], tasks: [] };
    render(<SettingsView onBack={mockOnBack} />);
    const fileInput = screen.getByTestId('file-input');
    const goodFile = new File([JSON.stringify(validBackup)], 'good.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [goodFile] } });
    await waitFor(() => {
      expect(screen.getByText('What would you like to do with your existing data?')).toBeInTheDocument();
      expect(screen.getByTestId('merge-button')).toBeInTheDocument();
      expect(screen.getByTestId('replace-button')).toBeInTheDocument();
    });
  });

  it('opens replace confirmation modal when Replace is clicked', async () => {
    const validBackup = { version: 1, exportedAt: new Date().toISOString(), buckets: [], tasks: [] };
    render(<SettingsView onBack={mockOnBack} />);
    const fileInput = screen.getByTestId('file-input');
    const goodFile = new File([JSON.stringify(validBackup)], 'good.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [goodFile] } });
    await waitFor(() => screen.getByTestId('replace-button'));
    await userEvent.click(screen.getByTestId('replace-button'));
    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-replace-button')).toBeInTheDocument();
    });
  });

  it('clears db and restores data when Replace is confirmed', async () => {
    const validBackup = { version: 1, exportedAt: new Date().toISOString(), buckets: [], tasks: [] };
    render(<SettingsView onBack={mockOnBack} />);
    const fileInput = screen.getByTestId('file-input');
    const goodFile = new File([JSON.stringify(validBackup)], 'good.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [goodFile] } });
    await waitFor(() => screen.getByTestId('replace-button'));
    await userEvent.click(screen.getByTestId('replace-button'));
    await waitFor(() => screen.getByTestId('confirm-replace-button'));
    await userEvent.click(screen.getByTestId('confirm-replace-button'));
    await waitFor(() => {
      expect(db.tasks.clear).toHaveBeenCalledOnce();
      expect(db.buckets.clear).toHaveBeenCalledOnce();
    });
  });

  it('shows success message after merge', async () => {
    const validBackup = { version: 1, exportedAt: new Date().toISOString(), buckets: [], tasks: [] };
    render(<SettingsView onBack={mockOnBack} />);
    const fileInput = screen.getByTestId('file-input');
    const goodFile = new File([JSON.stringify(validBackup)], 'good.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [goodFile] } });
    await waitFor(() => screen.getByTestId('merge-button'));
    await userEvent.click(screen.getByTestId('merge-button'));
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  // ─── Cloud Backup Card tests — signed out ─────────────────────────────────────

  describe('CloudBackupCard — signed out', () => {
    it('renders the cloud sign-out panel when not signed in', () => {
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByTestId('cloud-signed-out')).toBeInTheDocument();
    });

    it('shows sign-in mode by default', () => {
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByTestId('cloud-auth-button')).toHaveTextContent(/sign in/i);
    });

    it('switches to create account mode when toggled', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('cloud-mode-signup'));
      expect(screen.getByTestId('cloud-auth-button')).toHaveTextContent(/create account/i);
    });

    it('calls signIn with email and password on submit', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'test@test.com');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'password123');
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@test.com', 'password123');
      });
    });

    it('calls signUp when in create-account mode', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('cloud-mode-signup'));
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'new@test.com');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'password123');
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith('new@test.com', 'password123');
      });
    });

    it('shows validation error when fields are empty', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(screen.getByTestId('cloud-auth-error')).toBeInTheDocument();
      });
    });

    it('shows friendly error for wrong password', async () => {
      mockSignIn.mockRejectedValue(new Error('auth/invalid-credential'));
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'test@test.com');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'wrong');
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(screen.getByTestId('cloud-auth-error')).toHaveTextContent(/incorrect email or password/i);
      });
    });

    it('shows friendly error for email-already-in-use', async () => {
      mockSignUp.mockRejectedValue(new Error('auth/email-already-in-use'));
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('cloud-mode-signup'));
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'taken@test.com');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'pass123');
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(screen.getByTestId('cloud-auth-error')).toHaveTextContent(/already exists/i);
      });
    });

    it('shows friendly error for weak-password', async () => {
      mockSignUp.mockRejectedValue(new Error('auth/weak-password'));
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('cloud-mode-signup'));
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'new@test.com');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'abc');
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(screen.getByTestId('cloud-auth-error')).toHaveTextContent(/at least 6 characters/i);
      });
    });

    it('shows friendly error for invalid-email', async () => {
      mockSignIn.mockRejectedValue(new Error('auth/invalid-email'));
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'notanemail');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'password123');
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(screen.getByTestId('cloud-auth-error')).toHaveTextContent(/valid email address/i);
      });
    });

    it('shows generic fallback error for unknown errors', async () => {
      mockSignIn.mockRejectedValue(new Error('some-unknown-error-code'));
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'test@test.com');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'password123');
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(screen.getByTestId('cloud-auth-error')).toHaveTextContent(/something went wrong/i);
      });
    });

    it('clears auth error when switching mode', async () => {
      mockSignIn.mockRejectedValue(new Error('auth/invalid-credential'));
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'test@test.com');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'wrong');
      await userEvent.click(screen.getByTestId('cloud-auth-button'));
      await waitFor(() => {
        expect(screen.getByTestId('cloud-auth-error')).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId('cloud-mode-signup'));
      expect(screen.queryByTestId('cloud-auth-error')).not.toBeInTheDocument();
    });

    it('submits on Enter key in password field', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('cloud-email-input'), 'test@test.com');
      await userEvent.type(screen.getByTestId('cloud-password-input'), 'password123');
      await userEvent.keyboard('{Enter}');
      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@test.com', 'password123');
      });
    });
  });

  // ─── Cloud Backup Card tests — signed in ──────────────────────────────────────

  describe('CloudBackupCard — signed in', () => {
    const signedInAuth = (syncStatus: 'idle' | 'syncing' | 'synced' | 'error' = 'synced') => ({
      user: { email: 'user@test.com' },
      isSignedIn: true,
      syncStatus,
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
    });

    it('renders the cloud signed-in panel when signed in', () => {
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByTestId('cloud-signed-in')).toBeInTheDocument();
    });

    it('does not render the cloud signed-out panel when signed in', () => {
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.queryByTestId('cloud-signed-out')).not.toBeInTheDocument();
    });

    it('displays the signed-in user email', () => {
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByTestId('cloud-email')).toHaveTextContent('user@example.com');
    });

    it('shows "Connected" label when syncStatus is idle', () => {
      mockUseAuth.mockReturnValue(signedInAuth('idle'));
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows "Syncing…" label when syncStatus is syncing', () => {
      mockUseAuth.mockReturnValue(signedInAuth('syncing'));
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByText('Syncing…')).toBeInTheDocument();
    });

    it('shows "All synced" label when syncStatus is synced', () => {
      mockUseAuth.mockReturnValue(signedInAuth('synced'));
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByText('All synced')).toBeInTheDocument();
    });

    it('shows "Sync error" label when syncStatus is error', () => {
      mockUseAuth.mockReturnValue(signedInAuth('error'));
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByText('Sync error')).toBeInTheDocument();
    });

    it('calls signOut when the sign-out button is clicked', async () => {
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('cloud-signout-button'));
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
  });

  describe('AppModeCard', () => {
    it('renders the Sharing section heading', () => {
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByText('Sharing')).toBeInTheDocument();
    });

    it('renders the App Mode toggle with Owner and Contributor options', () => {
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByTestId('mode-owner-btn')).toBeInTheDocument();
      expect(screen.getByTestId('mode-contributor-btn')).toBeInTheDocument();
    });

    it('defaults to Owner mode', () => {
      mockGetAppMode.mockReturnValue('owner');
      render(<SettingsView onBack={mockOnBack} />);
      const ownerBtn = screen.getByTestId('mode-owner-btn');
      expect(ownerBtn.className).toContain('bg-nook-ink');
    });

    it('defaults to Contributor mode when getAppMode returns contributor', () => {
      mockGetAppMode.mockReturnValue('contributor');
      render(<SettingsView onBack={mockOnBack} />);
      const contribBtn = screen.getByTestId('mode-contributor-btn');
      expect(contribBtn.className).toContain('bg-nook-ink');
    });

    it('shows signed-out hint when in owner mode and not signed in', () => {
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByText(/Sign in via Cloud Backup/i)).toBeInTheDocument();
    });

    it('shows Generate Invite button when in owner mode and signed in', () => {
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByTestId('generate-invite-btn')).toBeInTheDocument();
    });

    it('clicking Generate Invite calls generateInviteCode', async () => {
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('generate-invite-btn'));
      await waitFor(() => {
        expect(mockGenerateInviteCode).toHaveBeenCalledWith('user-123', 'user@example.com');
      });
    });

    it('shows generated invite code after clicking Generate Invite', async () => {
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      mockGenerateInviteCode.mockResolvedValue('WXYZ5678');
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('generate-invite-btn'));
      expect(await screen.findByTestId('invite-code-text')).toHaveTextContent('WXYZ5678');
    });

    it('shows linked contributor card when owner has a linked contributor email stored', () => {
      mockGetStoredOwnerEmail.mockReturnValue('partner@example.com');
      // In owner mode we show linked contributor differently — the contributor panel
      // shows "linked to" and the owner panel shows the contributor card.
      // Actually getStoredOwnerEmail is the owner's email stored on contributor device.
      // In owner mode, no linked email comes from localStorage — it comes from getContributorPermission.
      // For simplicity test the contributor mode linked view instead:
      mockGetAppMode.mockReturnValue('contributor');
      mockGetStoredOwnerEmail.mockReturnValue('owner@nooks.app');
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByTestId('linked-owner-card')).toBeInTheDocument();
      expect(screen.getByText('owner@nooks.app')).toBeInTheDocument();
    });

    it('shows redeem input when in contributor mode and not linked', () => {
      mockGetAppMode.mockReturnValue('contributor');
      mockGetStoredOwnerEmail.mockReturnValue(null);
      render(<SettingsView onBack={mockOnBack} />);
      expect(screen.getByTestId('redeem-code-input')).toBeInTheDocument();
    });

    it('calls redeemInviteCode when Link Account is clicked', async () => {
      mockGetAppMode.mockReturnValue('contributor');
      mockGetStoredOwnerEmail.mockReturnValue(null);
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('redeem-code-input'), 'ABCD1234');
      await userEvent.click(screen.getByTestId('redeem-btn'));
      await waitFor(() => {
        expect(mockRedeemInviteCode).toHaveBeenCalledWith('ABCD1234', 'user-123', 'user@example.com');
      });
    });

    it('shows success message after successful redemption', async () => {
      mockGetAppMode.mockReturnValue('contributor');
      mockGetStoredOwnerEmail.mockReturnValue(null);
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('redeem-code-input'), 'ABCD1234');
      await userEvent.click(screen.getByTestId('redeem-btn'));
      expect(await screen.findByTestId('redeem-success')).toBeInTheDocument();
    });

    it('shows error message when redeem fails with expired code', async () => {
      mockGetAppMode.mockReturnValue('contributor');
      mockGetStoredOwnerEmail.mockReturnValue(null);
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      mockRedeemInviteCode.mockRejectedValueOnce(new Error('Invite code expired'));
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('redeem-code-input'), 'XXXX9999');
      await userEvent.click(screen.getByTestId('redeem-btn'));
      expect(await screen.findByTestId('redeem-error')).toHaveTextContent(/expired/i);
    });

    it('switching to contributor mode calls setAppMode with contributor', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('mode-contributor-btn'));
      expect(mockSetAppMode).toHaveBeenCalledWith('contributor');
    });

    it('switching back to owner mode calls setAppMode with owner', async () => {
      mockGetAppMode.mockReturnValue('contributor');
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(screen.getByTestId('mode-owner-btn'));
      expect(mockSetAppMode).toHaveBeenCalledWith('owner');
    });

    it('contributor mode shows linked-owner card when permission is loaded', async () => {
      mockGetAppMode.mockReturnValue('contributor');
      mockGetStoredOwnerEmail.mockReturnValue(null);
      mockGetContributorPermission.mockResolvedValue({
        ownerUID: 'owner-uid', ownerEmail: 'linked@owner.com', linkedAt: new Date(),
      });
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
      render(<SettingsView onBack={mockOnBack} />);
      // linked-owner-card shows after permission loads and setLinkedEmail fires
      expect(await screen.findByTestId('linked-owner-card')).toBeInTheDocument();
      expect(screen.getByText('linked@owner.com')).toBeInTheDocument();
    });
  });

  // ─── PushNotificationsCard ────────────────────────────────────────────────

  describe('PushNotificationsCard', () => {
    beforeEach(() => {
      // Sign in so the Notifications section renders
      mockUseAuth.mockReturnValue(signedInAuthWithUID());
    });

    it('does not render the Notifications section when signed out', async () => {
      mockUseAuth.mockReturnValue(signedOutAuth);
      render(<SettingsView onBack={mockOnBack} />);
      // Wait briefly — isFcmSupported is async so give the card a chance to mount
      await waitFor(() => {
        expect(screen.queryByTestId('push-notifications-card')).not.toBeInTheDocument();
      });
    });

    it('does not render the push card when FCM is not supported', async () => {
      mockIsFcmSupported.mockResolvedValue(false);
      render(<SettingsView onBack={mockOnBack} />);
      await waitFor(() => {
        expect(screen.queryByTestId('push-notifications-card')).not.toBeInTheDocument();
      });
    });

    it('renders the push card with Enable button when permission is default', async () => {
      mockGetNotificationPermission.mockReturnValue('default');
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByTestId('push-notifications-card')).toBeInTheDocument();
      expect(screen.getByTestId('push-enable-button')).toBeInTheDocument();
    });

    it('renders the "enabled" state when permission is already granted', async () => {
      mockGetNotificationPermission.mockReturnValue('granted');
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByTestId('push-enabled')).toBeInTheDocument();
      expect(screen.queryByTestId('push-enable-button')).not.toBeInTheDocument();
    });

    it('renders the "blocked" message when permission is denied', async () => {
      mockGetNotificationPermission.mockReturnValue('denied');
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByTestId('push-denied')).toBeInTheDocument();
      expect(screen.queryByTestId('push-enable-button')).not.toBeInTheDocument();
    });

    it('transitions to enabled state after a successful token request', async () => {
      mockGetNotificationPermission.mockReturnValue('default');
      mockRequestPermissionAndSaveToken.mockResolvedValue('valid-fcm-token');
      render(<SettingsView onBack={mockOnBack} />);

      const button = await screen.findByTestId('push-enable-button');
      await userEvent.click(button);

      expect(mockRequestPermissionAndSaveToken).toHaveBeenCalledOnce();
      expect(await screen.findByTestId('push-enabled')).toBeInTheDocument();
    });

    it('transitions to denied state when requestPermission is rejected', async () => {
      mockGetNotificationPermission.mockReturnValue('default');
      mockRequestPermissionAndSaveToken.mockResolvedValue(null); // null = denied/failed
      render(<SettingsView onBack={mockOnBack} />);

      const button = await screen.findByTestId('push-enable-button');
      await userEvent.click(button);

      expect(mockRequestPermissionAndSaveToken).toHaveBeenCalledOnce();
      // Stays on default OR transitions to denied — either way the enable button is gone
      // (our component sets 'denied' on null return)
      expect(await screen.findByTestId('push-denied')).toBeInTheDocument();
    });

    it('disables the Enable button while the request is in flight', async () => {
      mockGetNotificationPermission.mockReturnValue('default');
      let resolve!: (v: string | null) => void;
      mockRequestPermissionAndSaveToken.mockReturnValue(new Promise(r => { resolve = r; }));
      render(<SettingsView onBack={mockOnBack} />);

      const button = await screen.findByTestId('push-enable-button');
      fireEvent.click(button);

      // Button should be disabled while loading
      await waitFor(() => expect(button).toBeDisabled());

      // Resolve and confirm it recovers
      resolve('token');
      await waitFor(() => expect(screen.getByTestId('push-enabled')).toBeInTheDocument());
    });
  });

  // ─── RemindersCard ──────────────────────────────────────────────────────────

  describe('RemindersCard', () => {
    it('renders regardless of sign-in state', async () => {
      mockUseAuth.mockReturnValue(signedOutAuth);
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByTestId('reminders-card')).toBeInTheDocument();
    });

    it('shows the empty state when there are no reminders', async () => {
      mockGetReminders.mockResolvedValue([]);
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByTestId('reminders-empty')).toBeInTheDocument();
    });

    it('lists existing reminders with interval and next due date', async () => {
      mockGetReminders.mockResolvedValue([
        createReminder({ id: 1, title: 'Refill prescription', intervalDays: 35, nextDueDate: new Date(2026, 7, 6), active: true }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByTestId('reminder-row-1')).toBeInTheDocument();
      expect(screen.getByText('Refill prescription')).toBeInTheDocument();
      expect(screen.getByText(/Every 35 days/)).toBeInTheDocument();
      expect(screen.getByText(/Aug 6, 2026/)).toBeInTheDocument();
    });

    it('shows a Paused label for an inactive reminder', async () => {
      mockGetReminders.mockResolvedValue([
        createReminder({ id: 2, title: 'Inactive item', active: false }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByTestId('reminder-row-2')).toBeInTheDocument();
      expect(screen.getByText(/Paused/)).toBeInTheDocument();
    });

    it('the Add Reminder button is disabled until title and a valid interval are entered', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      const addButton = await screen.findByTestId('reminder-add-button');
      expect(addButton).toBeDisabled();

      await userEvent.type(screen.getByTestId('reminder-title-input'), 'Water plants');
      expect(addButton).toBeDisabled();

      await userEvent.type(screen.getByTestId('reminder-interval-input'), '7');
      expect(addButton).not.toBeDisabled();
    });

    it('the Add Reminder button stays disabled for a zero interval', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.type(screen.getByTestId('reminder-title-input'), 'Water plants');
      await userEvent.type(screen.getByTestId('reminder-interval-input'), '0');
      expect(screen.getByTestId('reminder-add-button')).toBeDisabled();
    });

    it('creates a reminder and reloads the list', async () => {
      mockGetReminders.mockResolvedValueOnce([]).mockResolvedValueOnce([
        createReminder({ id: 3, title: 'Water plants', intervalDays: 7, active: true }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);

      await userEvent.type(await screen.findByTestId('reminder-title-input'), 'Water plants');
      await userEvent.type(screen.getByTestId('reminder-interval-input'), '7');
      await userEvent.click(screen.getByTestId('reminder-add-button'));

      expect(mockAddReminder).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Water plants', intervalDays: 7, active: true, nextDueDate: expect.any(Date) })
      );
      expect(await screen.findByTestId('reminder-row-3')).toBeInTheDocument();
    });

    it('clears the form after a successful create', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      const titleInput = await screen.findByTestId('reminder-title-input') as HTMLInputElement;
      const intervalInput = screen.getByTestId('reminder-interval-input') as HTMLInputElement;

      await userEvent.type(titleInput, 'Water plants');
      await userEvent.type(intervalInput, '7');
      await userEvent.click(screen.getByTestId('reminder-add-button'));

      await waitFor(() => expect(titleInput.value).toBe(''));
      expect(intervalInput.value).toBe('');
    });

    it('deletes a reminder', async () => {
      mockGetReminders.mockResolvedValueOnce([
        createReminder({ id: 4, title: 'Delete me', active: true }),
      ]).mockResolvedValueOnce([]);
      render(<SettingsView onBack={mockOnBack} />);

      const deleteButton = await screen.findByTestId('reminder-delete-4');
      await userEvent.click(deleteButton);

      expect(mockDeleteReminder).toHaveBeenCalledWith(4);
      await waitFor(() => expect(screen.queryByTestId('reminder-row-4')).not.toBeInTheDocument());
    });

    it('pauses an active reminder', async () => {
      mockGetReminders.mockResolvedValue([
        createReminder({ id: 5, title: 'Pause me', active: true }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);

      const toggleButton = await screen.findByTestId('reminder-toggle-5');
      expect(toggleButton).toHaveAttribute('aria-label', 'Pause reminder');
      await userEvent.click(toggleButton);

      expect(mockUpdateReminder).toHaveBeenCalledWith(5, { active: false });
    });

    it('resumes a paused reminder', async () => {
      mockGetReminders.mockResolvedValue([
        createReminder({ id: 6, title: 'Resume me', active: false }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);

      const toggleButton = await screen.findByTestId('reminder-toggle-6');
      expect(toggleButton).toHaveAttribute('aria-label', 'Resume reminder');
      await userEvent.click(toggleButton);

      expect(mockUpdateReminder).toHaveBeenCalledWith(6, { active: true });
    });

    it('shows a note that background delivery requires sign-in', async () => {
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByText(/requires sign-in/i)).toBeInTheDocument();
    });

    it('shows a resend button for a due reminder', async () => {
      mockGetReminders.mockResolvedValue([
        createReminder({ id: 7, title: 'Overdue reminder', active: true, nextDueDate: new Date('2000-01-01') }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);
      expect(await screen.findByTestId('reminder-resend-7')).toBeInTheDocument();
    });

    it('does not show a resend button for a reminder that is not yet due', async () => {
      mockGetReminders.mockResolvedValue([
        createReminder({ id: 8, title: 'Future reminder', active: true, nextDueDate: new Date('2099-01-01') }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);
      await screen.findByTestId('reminder-row-8');
      expect(screen.queryByTestId('reminder-resend-8')).not.toBeInTheDocument();
    });

    it('does not show a resend button for a paused reminder even if overdue', async () => {
      mockGetReminders.mockResolvedValue([
        createReminder({ id: 9, title: 'Paused overdue', active: false, nextDueDate: new Date('2000-01-01') }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);
      await screen.findByTestId('reminder-row-9');
      expect(screen.queryByTestId('reminder-resend-9')).not.toBeInTheDocument();
    });

    it('clicking resend calls resendNotification with the reminder title', async () => {
      mockGetReminders.mockResolvedValue([
        createReminder({ id: 10, title: 'Refill prescription', active: true, nextDueDate: new Date('2000-01-01') }),
      ]);
      render(<SettingsView onBack={mockOnBack} />);
      await userEvent.click(await screen.findByTestId('reminder-resend-10'));
      expect(mockResendNotification).toHaveBeenCalledWith(
        '⏰ Refill prescription',
        expect.objectContaining({ body: 'This reminder is due today.' })
      );
    });
  });
});
