import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsView } from './SettingsView';
import * as backupService from '../services/backupService';
import * as repository from '../services/repository';
import { db } from '../db';

// Mock the modules that touch the real filesystem / DOM download
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
});
