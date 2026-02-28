import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContributorHomeView } from './ContributorHomeView';
import type { InboxItem } from '../services/contributorService';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetContributorSubmissions = vi.fn<any>(async (): Promise<InboxItem[]> => []);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSubmitInboxTask = vi.fn<any>(async () => 'new-inbox-id');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDeleteInboxItem = vi.fn<any>(async () => {});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetAcceptedTaskStatus = vi.fn<any>(async () => null);
const mockGetDismissedSubmissionIds = vi.fn(() => new Set<string>());
const mockDismissSubmission = vi.fn();
const mockClearDismissedSubmissions = vi.fn();

const mockGetStoredOwnerUID = vi.fn(() => 'owner-uid-123');
const mockGetStoredOwnerEmail = vi.fn(() => 'owner@example.com');

vi.mock('../services/contributorService', () => ({
  getContributorSubmissions: (ownerUID: string, contributorUID: string) =>
    mockGetContributorSubmissions(ownerUID, contributorUID),
  submitInboxTask: (ownerUID: string, item: unknown) => mockSubmitInboxTask(ownerUID, item),
  deleteInboxItem: (ownerUID: string, inboxId: string) => mockDeleteInboxItem(ownerUID, inboxId),
  getAcceptedTaskStatus: (ownerUID: string, taskId: number) =>
    mockGetAcceptedTaskStatus(ownerUID, taskId),
  getDismissedSubmissionIds: () => mockGetDismissedSubmissionIds(),
  dismissSubmission: (id: string) => mockDismissSubmission(id),
  clearDismissedSubmissions: () => mockClearDismissedSubmissions(),
  getStoredOwnerUID: () => mockGetStoredOwnerUID(),
  getStoredOwnerEmail: () => mockGetStoredOwnerEmail(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'contrib-uid-456', email: 'contributor@example.com' },
    isSignedIn: true,
  }),
}));

vi.mock('../hooks/usePullToRefresh', () => ({
  usePullToRefresh: vi.fn(() => ({ pullDistance: 0, isRefreshing: false })),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      layout: _l,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown; layout?: unknown;
    }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { usePullToRefresh } from '../hooks/usePullToRefresh';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const mockOnNavigateToSettings = vi.fn();

function renderView() {
  return render(<ContributorHomeView onNavigateToSettings={mockOnNavigateToSettings} />);
}

function createInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'inbox-1',
    title: 'Test submission',
    isUrgent: false,
    isImportant: false,
    contributorUID: 'contrib-uid-456',
    contributorEmail: 'contributor@example.com',
    status: 'pending',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetContributorSubmissions.mockResolvedValue([]);
  mockGetAcceptedTaskStatus.mockResolvedValue(null);
  mockGetDismissedSubmissionIds.mockReturnValue(new Set<string>());
  mockGetStoredOwnerUID.mockReturnValue('owner-uid-123');
  mockGetStoredOwnerEmail.mockReturnValue('owner@example.com');
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ContributorHomeView', () => {
  describe('header', () => {
    it('renders the heading', async () => {
      renderView();
      expect(await screen.findByText('Add a task')).toBeInTheDocument();
    });

    it('shows owner email in the subtitle', async () => {
      renderView();
      expect(await screen.findByText('owner@example.com')).toBeInTheDocument();
    });

    it('falls back to "your partner" when no owner email is stored', async () => {
      mockGetStoredOwnerEmail.mockReturnValue(null);
      renderView();
      expect(await screen.findByText('your partner')).toBeInTheDocument();
    });

    it('renders the settings gear icon', async () => {
      renderView();
      await screen.findByText('Add a task');
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });

    it('gear icon navigates to settings', async () => {
      renderView();
      await screen.findByText('Add a task');
      await userEvent.click(screen.getByRole('button', { name: /settings/i }));
      expect(mockOnNavigateToSettings).toHaveBeenCalledOnce();
    });
  });

  describe('loading and empty states', () => {
    it('shows loading state while fetching submissions', async () => {
      let resolve: (items: InboxItem[]) => void;
      mockGetContributorSubmissions.mockReturnValueOnce(new Promise(r => { resolve = r; }));
      renderView();
      expect(screen.getByText(/loading your submissions/i)).toBeInTheDocument();
      resolve!([]);
    });

    it('shows empty state when no submissions', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([]);
      renderView();
      expect(await screen.findByText('No tasks submitted yet.')).toBeInTheDocument();
    });
  });

  describe('submissions list', () => {
    it('renders submission title', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ title: 'Pick up groceries' }),
      ]);
      renderView();
      expect(await screen.findByText('Pick up groceries')).toBeInTheDocument();
    });

    it('renders pending status pill', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ status: 'pending' }),
      ]);
      renderView();
      expect(await screen.findByText(/⏳ Pending/)).toBeInTheDocument();
    });

    it('renders accepted status pill (no taskId → Accepted fallback)', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ status: 'accepted' }), // no taskId — getAcceptedTaskStatus not called
      ]);
      renderView();
      expect(await screen.findByText(/✅ Accepted/)).toBeInTheDocument();
    });

    it('renders live task status for accepted items with a taskId', async () => {
      mockGetAcceptedTaskStatus.mockResolvedValueOnce('in-progress');
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'acc-1', status: 'accepted', taskId: 5 }),
      ]);
      renderView();
      expect(await screen.findByText(/✅ In Progress/)).toBeInTheDocument();
    });

    it('shows "Done ✓" when accepted task is completed', async () => {
      mockGetAcceptedTaskStatus.mockResolvedValueOnce('done');
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'acc-done', status: 'accepted', taskId: 7 }),
      ]);
      renderView();
      expect(await screen.findByText(/✅ Done ✓/)).toBeInTheDocument();
    });

    it('renders declined status pill', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ status: 'declined' }),
      ]);
      renderView();
      expect(await screen.findByText(/❌ Declined/)).toBeInTheDocument();
    });

    it('shows due date when present', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ dueDate: new Date(2025, 2, 15) }),
      ]);
      renderView();
      expect(await screen.findByText(/Mar 15/)).toBeInTheDocument();
    });

    it('pending items show delete button but not dismiss', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'pending-item', status: 'pending' }),
      ]);
      renderView();
      await screen.findByText('Test submission');
      expect(screen.getByRole('button', { name: /delete submission/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
    });

    it('non-pending items show both dismiss and delete buttons', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'accepted-item', status: 'accepted', title: 'Accepted task' }),
      ]);
      renderView();
      await screen.findByText('Accepted task');
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete submission/i })).toBeInTheDocument();
    });

    it('shows details when present', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ details: 'Bring the receipt' }),
      ]);
      renderView();
      expect(await screen.findByText('Bring the receipt')).toBeInTheDocument();
    });

    it('calls getContributorSubmissions with ownerUID and contributorUID', async () => {
      renderView();
      await waitFor(() => {
        expect(mockGetContributorSubmissions).toHaveBeenCalledWith('owner-uid-123', 'contrib-uid-456');
      });
    });

    it('hides dismissed items from view', async () => {
      mockGetDismissedSubmissionIds.mockReturnValue(new Set(['dismissed-id']));
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'dismissed-id', status: 'accepted', title: 'Hidden task' }),
        createInboxItem({ id: 'visible-id', status: 'pending', title: 'Visible task' }),
      ]);
      renderView();
      expect(await screen.findByText('Visible task')).toBeInTheDocument();
      expect(screen.queryByText('Hidden task')).not.toBeInTheDocument();
    });
  });

  describe('delete submission', () => {
    it('calls deleteInboxItem when delete button is clicked on a pending item', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'del-item', status: 'pending' }),
      ]);
      renderView();
      const deleteBtn = await screen.findByRole('button', { name: /delete submission/i });
      await userEvent.click(deleteBtn);
      await waitFor(() => {
        expect(mockDeleteInboxItem).toHaveBeenCalledWith('owner-uid-123', 'del-item');
      });
    });

    it('removes deleted pending item from the list', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'del-item', title: 'Going away', status: 'pending' }),
      ]);
      renderView();
      const deleteBtn = await screen.findByRole('button', { name: /delete submission/i });
      await userEvent.click(deleteBtn);
      await waitFor(() => {
        expect(screen.queryByText('Going away')).not.toBeInTheDocument();
      });
    });

    it('calls deleteInboxItem when delete button is clicked on an accepted item', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'acc-del', status: 'accepted', title: 'Done task' }),
      ]);
      renderView();
      const deleteBtn = await screen.findByRole('button', { name: /delete submission/i });
      await userEvent.click(deleteBtn);
      await waitFor(() => {
        expect(mockDeleteInboxItem).toHaveBeenCalledWith('owner-uid-123', 'acc-del');
      });
    });

    it('removes deleted accepted item from the list', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'acc-del', status: 'accepted', title: 'Done task' }),
      ]);
      renderView();
      const deleteBtn = await screen.findByRole('button', { name: /delete submission/i });
      await userEvent.click(deleteBtn);
      await waitFor(() => {
        expect(screen.queryByText('Done task')).not.toBeInTheDocument();
      });
    });
  });

  describe('dismiss submission', () => {
    it('calls dismissSubmission when dismiss button is clicked', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'accepted-1', status: 'accepted', title: 'Done and dusted' }),
      ]);
      renderView();
      const dismissBtn = await screen.findByRole('button', { name: /dismiss/i });
      await userEvent.click(dismissBtn);
      await waitFor(() => {
        expect(mockDismissSubmission).toHaveBeenCalledWith('accepted-1');
      });
    });

    it('removes dismissed item from the visible list', async () => {
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'accepted-1', status: 'accepted', title: 'Done and dusted' }),
      ]);
      renderView();
      const dismissBtn = await screen.findByRole('button', { name: /dismiss/i });
      await userEvent.click(dismissBtn);
      await waitFor(() => {
        expect(screen.queryByText('Done and dusted')).not.toBeInTheDocument();
      });
    });

    it('shows hidden count footer when some items are dismissed', async () => {
      mockGetDismissedSubmissionIds.mockReturnValue(new Set(['hidden-1']));
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'hidden-1', status: 'accepted', title: 'Hidden item' }),
        createInboxItem({ id: 'visible-1', status: 'pending', title: 'Visible item' }),
      ]);
      renderView();
      expect(await screen.findByText('Visible item')).toBeInTheDocument();
      expect(screen.getByText(/1 hidden · Reveal/i)).toBeInTheDocument();
    });

    it('shows "all caught up" state when all items are dismissed', async () => {
      mockGetDismissedSubmissionIds.mockReturnValue(new Set(['all-hidden']));
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'all-hidden', status: 'accepted', title: 'Hidden task' }),
      ]);
      renderView();
      expect(await screen.findByText('All caught up.')).toBeInTheDocument();
      expect(screen.getByText(/Show 1 hidden item/i)).toBeInTheDocument();
    });

    it('calls clearDismissedSubmissions and reveals items when reveal is clicked (footer)', async () => {
      mockGetDismissedSubmissionIds.mockReturnValue(new Set(['hidden-1']));
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'hidden-1', status: 'accepted', title: 'Hidden item' }),
        createInboxItem({ id: 'visible-1', status: 'pending', title: 'Visible item' }),
      ]);
      renderView();
      await screen.findByText('Visible item');
      const revealBtn = screen.getByText(/1 hidden · Reveal/i);
      await userEvent.click(revealBtn);
      await waitFor(() => {
        expect(mockClearDismissedSubmissions).toHaveBeenCalledOnce();
        expect(screen.getByText('Hidden item')).toBeInTheDocument();
      });
    });

    it('calls clearDismissedSubmissions and reveals items when reveal is clicked (all-caught-up state)', async () => {
      mockGetDismissedSubmissionIds.mockReturnValue(new Set(['all-hidden']));
      mockGetContributorSubmissions.mockResolvedValueOnce([
        createInboxItem({ id: 'all-hidden', status: 'accepted', title: 'Hidden task' }),
      ]);
      renderView();
      await screen.findByText('All caught up.');
      const revealBtn = screen.getByText(/Show 1 hidden item/i);
      await userEvent.click(revealBtn);
      await waitFor(() => {
        expect(mockClearDismissedSubmissions).toHaveBeenCalledOnce();
        expect(screen.getByText('Hidden task')).toBeInTheDocument();
      });
    });
  });

  describe('FAB and submit form', () => {
    it('renders the FAB', async () => {
      renderView();
      await screen.findByText('No tasks submitted yet.');
      expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument();
    });

    it('opens the submit form when FAB is clicked', async () => {
      renderView();
      await screen.findByText('No tasks submitted yet.');
      await userEvent.click(screen.getByRole('button', { name: /add task/i }));
      expect(screen.getByPlaceholderText("What needs doing?")).toBeInTheDocument();
    });

    it('shows owner email in the form', async () => {
      renderView();
      await screen.findByText('No tasks submitted yet.');
      await userEvent.click(screen.getByRole('button', { name: /add task/i }));
      // The form shows the "This task will be sent to [email]" message
      expect(screen.getByText(/This task will be sent to/)).toBeInTheDocument();
    });

    it('form does not submit when title is empty', async () => {
      renderView();
      await screen.findByText('No tasks submitted yet.');
      await userEvent.click(screen.getByRole('button', { name: /add task/i }));
      await userEvent.click(screen.getByText('Send Task'));
      expect(mockSubmitInboxTask).not.toHaveBeenCalled();
    });

    it('calls submitInboxTask with owner uid and task data', async () => {
      renderView();
      await screen.findByText('No tasks submitted yet.');
      await userEvent.click(screen.getByRole('button', { name: /add task/i }));
      await userEvent.type(screen.getByPlaceholderText("What needs doing?"), 'Fix the bike');
      await userEvent.click(screen.getByText('Send Task'));
      await waitFor(() => {
        expect(mockSubmitInboxTask).toHaveBeenCalledWith(
          'owner-uid-123',
          expect.objectContaining({
            title: 'Fix the bike',
            contributorUID: 'contrib-uid-456',
            contributorEmail: 'contributor@example.com',
          })
        );
      });
    });

    it('optimistically adds submitted task to the list', async () => {
      renderView();
      await screen.findByText('No tasks submitted yet.');
      await userEvent.click(screen.getByRole('button', { name: /add task/i }));
      await userEvent.type(screen.getByPlaceholderText("What needs doing?"), 'New task title');
      await userEvent.click(screen.getByText('Send Task'));
      await waitFor(() => {
        expect(screen.getByText('New task title')).toBeInTheDocument();
      });
    });

    it('closes the form after successful submit', async () => {
      renderView();
      await screen.findByText('No tasks submitted yet.');
      await userEvent.click(screen.getByRole('button', { name: /add task/i }));
      await userEvent.type(screen.getByPlaceholderText("What needs doing?"), 'Some task');
      await userEvent.click(screen.getByText('Send Task'));
      await waitFor(() => {
        expect(screen.queryByPlaceholderText("What needs doing?")).not.toBeInTheDocument();
      });
    });

    it('closes the form when the cancel button is clicked', async () => {
      renderView();
      await screen.findByText('No tasks submitted yet.');
      await userEvent.click(screen.getByRole('button', { name: /add task/i }));
      expect(screen.getByPlaceholderText("What needs doing?")).toBeInTheDocument();
      // Find the secondary (cancel) button — it's the one before "Send Task"
      const sendBtn = screen.getByText('Send Task').closest('button')!;
      const allBtns = Array.from(document.querySelectorAll('button'));
      const sendIdx = allBtns.indexOf(sendBtn);
      await userEvent.click(allBtns[sendIdx - 1]);
      await waitFor(() => {
        expect(screen.queryByPlaceholderText("What needs doing?")).not.toBeInTheDocument();
      });
    });
  });

  describe('no owner uid edge case', () => {
    it('shows empty state when ownerUID is null', async () => {
      mockGetStoredOwnerUID.mockReturnValue(null);
      renderView();
      expect(await screen.findByText('No tasks submitted yet.')).toBeInTheDocument();
    });

    it('does not call getContributorSubmissions when ownerUID is null', async () => {
      mockGetStoredOwnerUID.mockReturnValue(null);
      renderView();
      await screen.findByText('No tasks submitted yet.');
      expect(mockGetContributorSubmissions).not.toHaveBeenCalled();
    });
  });

  describe('pull-to-refresh', () => {
    it('re-fetches submissions when onRefresh is triggered', async () => {
      mockGetContributorSubmissions.mockResolvedValue([]);
      renderView();
      await screen.findByText('No tasks submitted yet.');

      // Grab the onRefresh callback captured by the mocked usePullToRefresh hook
      const capturedOnRefresh = vi.mocked(usePullToRefresh).mock.calls[0][0].onRefresh;
      mockGetContributorSubmissions.mockClear();
      await act(async () => { await capturedOnRefresh(); });

      await waitFor(() => {
        expect(mockGetContributorSubmissions).toHaveBeenCalledWith('owner-uid-123', 'contrib-uid-456');
      });
    });
  });
});
