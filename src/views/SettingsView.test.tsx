import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from './SettingsView';
import * as backupService from '../services/backupService';
import * as repository from '../services/repository';
import { db } from '../db';

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const { mockSignIn, mockSignUp, mockSignOut } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
}));

// ─── Mock AuthContext (default: signed out) ───────────────────────────────────

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isSignedIn: false,
    syncStatus: 'idle' as const,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
  }),
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
    },
  };
});

vi.mock('../db', () => ({
  db: {
    buckets: { clear: vi.fn(async () => {}) },
    tasks: { clear: vi.fn(async () => {}) },
  },
}));

const mockOnBack = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSignIn.mockResolvedValue(undefined);
  mockSignUp.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
  vi.mocked(backupService.getLastExportDate).mockReturnValue(null);
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

  // ─── Cloud Backup Card tests ─────────────────────────────────────────────────

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
});
