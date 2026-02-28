import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksView } from './TasksView';
import { createTask, createBucket } from '../tests/factories';
import type { InboxItem } from '../services/contributorService';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('../services/repository', () => ({
  repository: {
    getAllTasks: vi.fn(async () => []),
    getAllBuckets: vi.fn(async () => []),
    addTask: vi.fn(async () => 1),
    updateTask: vi.fn(async () => {}),
    deleteTask: vi.fn(async () => {}),
    addBucket: vi.fn(async () => 1),
    updateBucket: vi.fn(async () => {}),
    deleteBucket: vi.fn(async () => {}),
  },
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, layout: _l, ...props }:
      React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown; layout?: unknown }
    ) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchPendingInboxItems = vi.fn<any>(async (): Promise<InboxItem[]> => []);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAcceptInboxItem = vi.fn<any>(async () => {});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDeclineInboxItem = vi.fn<any>(async () => {});

vi.mock('../services/contributorService', () => ({
  fetchPendingInboxItems: (ownerUID: string) => mockFetchPendingInboxItems(ownerUID),
  acceptInboxItem: (ownerUID: string, inboxId: string, taskId: number) => mockAcceptInboxItem(ownerUID, inboxId, taskId),
  declineInboxItem: (ownerUID: string, inboxId: string) => mockDeclineInboxItem(ownerUID, inboxId),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'owner-123' }, isSignedIn: true }),
}));

vi.mock('../hooks/usePullToRefresh', () => ({
  usePullToRefresh: vi.fn(() => ({ pullDistance: 0, isRefreshing: false })),
}));

import { useLiveQuery } from 'dexie-react-hooks';
import { repository } from '../services/repository';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

function createInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'inbox-1',
    title: 'Partner task',
    isUrgent: false,
    isImportant: false,
    contributorUID: 'contrib-456',
    contributorEmail: 'partner@example.com',
    status: 'pending',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// useLiveQuery is called twice per render: once for tasks, once for buckets.
// Use mockReturnValue with a counter to alternate return values.
function setupLiveQuery(tasks = [], buckets = []) {
  let callCount = 0;
  vi.mocked(useLiveQuery).mockImplementation(() => {
    callCount++;
    return callCount % 2 === 1 ? tasks : buckets;
  });
}

const mockOnClearFilter = vi.fn();
const mockOnFilterChange = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Default: inbox returns empty array (avoids timeouts in non-inbox tests)
  mockFetchPendingInboxItems.mockResolvedValue([]);
});

describe('TasksView', () => {
  describe('loading state', () => {
    it('renders nothing when tasks are undefined', () => {
      let call = 0;
      vi.mocked(useLiveQuery).mockImplementation(() => (++call === 1 ? undefined : []));
      const { container } = render(<TasksView />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when buckets are undefined', () => {
      let call = 0;
      vi.mocked(useLiveQuery).mockImplementation(() => (++call === 1 ? [] : undefined));
      const { container } = render(<TasksView />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('header', () => {
    it('renders the Tasks heading', () => {
      setupLiveQuery();
      render(<TasksView />);
      expect(screen.getByText('Tasks')).toBeInTheDocument();
    });

    it('renders All Buckets filter chip', () => {
      setupLiveQuery();
      render(<TasksView />);
      expect(screen.getByText('All Buckets')).toBeInTheDocument();
    });

    it('renders Backlog filter chip', () => {
      setupLiveQuery();
      render(<TasksView />);
      expect(screen.getByText('Backlog')).toBeInTheDocument();
    });

    it('renders a chip for each bucket', () => {
      const buckets = [
        createBucket({ id: 1, name: 'Work', emoji: '💼' }),
        createBucket({ id: 2, name: 'Personal', emoji: '🏠' }),
      ];
      setupLiveQuery([], buckets);
      render(<TasksView />);
      expect(screen.getByText('Work')).toBeInTheDocument();
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });
  });

  describe('status filter chip', () => {
    it('shows the active filter chip when initialStatusFilter is set', () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter="done" onClearFilter={mockOnClearFilter} />);
      expect(screen.getByText('done')).toBeInTheDocument();
    });

    it('does not show filter chip when initialStatusFilter is null', () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter={null} onClearFilter={mockOnClearFilter} />);
      expect(screen.queryByText('done')).not.toBeInTheDocument();
    });

    it('calls onClearFilter when the active filter chip is clicked', async () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter="done" onClearFilter={mockOnClearFilter} />);
      await userEvent.click(screen.getByText('done').closest('button')!);
      expect(mockOnClearFilter).toHaveBeenCalledOnce();
    });

    it('calls onFilterChange with backlog when Backlog chip is clicked', async () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter={null} onFilterChange={mockOnFilterChange} />);
      await userEvent.click(screen.getByText('Backlog'));
      expect(mockOnFilterChange).toHaveBeenCalledWith('backlog');
    });

    it('calls onFilterChange with null when Backlog chip is clicked and already active', async () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter="backlog" onFilterChange={mockOnFilterChange} />);
      await userEvent.click(screen.getByText('Backlog'));
      expect(mockOnFilterChange).toHaveBeenCalledWith(null);
    });
  });

  describe('task list filtering', () => {
    const allTasks = [
      createTask({ id: 10, title: 'Todo task', status: 'todo' }),
      createTask({ id: 11, title: 'In progress task', status: 'in-progress' }),
      createTask({ id: 12, title: 'Done task', status: 'done' }),
      createTask({ id: 13, title: 'Backlog task', status: 'backlog' }),
    ];

    it('default view hides done and backlog tasks', () => {
      setupLiveQuery(allTasks);
      render(<TasksView initialStatusFilter={null} />);
      expect(screen.getByText('Todo task')).toBeInTheDocument();
      expect(screen.getByText('In progress task')).toBeInTheDocument();
      expect(screen.queryByText('Done task')).not.toBeInTheDocument();
      expect(screen.queryByText('Backlog task')).not.toBeInTheDocument();
    });

    it('active filter shows only todo and in-progress', () => {
      setupLiveQuery(allTasks);
      render(<TasksView initialStatusFilter="active" />);
      expect(screen.getByText('Todo task')).toBeInTheDocument();
      expect(screen.getByText('In progress task')).toBeInTheDocument();
      expect(screen.queryByText('Done task')).not.toBeInTheDocument();
      expect(screen.queryByText('Backlog task')).not.toBeInTheDocument();
    });

    it('done filter shows only done tasks', () => {
      setupLiveQuery(allTasks);
      render(<TasksView initialStatusFilter="done" />);
      expect(screen.getByText('Done task')).toBeInTheDocument();
      expect(screen.queryByText('Todo task')).not.toBeInTheDocument();
    });

    it('backlog filter shows only backlog tasks', () => {
      setupLiveQuery(allTasks);
      render(<TasksView initialStatusFilter="backlog" />);
      expect(screen.getByText('Backlog task')).toBeInTheDocument();
      expect(screen.queryByText('Todo task')).not.toBeInTheDocument();
    });

    it('in-progress filter shows only in-progress tasks', () => {
      setupLiveQuery(allTasks);
      render(<TasksView initialStatusFilter="in-progress" />);
      expect(screen.getByText('In progress task')).toBeInTheDocument();
      expect(screen.queryByText('Todo task')).not.toBeInTheDocument();
    });

    it('urgent-important filter shows only urgent+important active tasks', () => {
      const tasks = [
        createTask({ id: 20, title: 'Urgent + Important', status: 'todo', isUrgent: true, isImportant: true }),
        createTask({ id: 21, title: 'Just urgent', status: 'todo', isUrgent: true, isImportant: false }),
        createTask({ id: 22, title: 'Done urgent imp', status: 'done', isUrgent: true, isImportant: true }),
      ];
      setupLiveQuery(tasks);
      render(<TasksView initialStatusFilter="urgent-important" />);
      expect(screen.getByText('Urgent + Important')).toBeInTheDocument();
      expect(screen.queryByText('Just urgent')).not.toBeInTheDocument();
      expect(screen.queryByText('Done urgent imp')).not.toBeInTheDocument();
    });

    it('important-not-urgent filter shows only important non-urgent active tasks', () => {
      const tasks = [
        createTask({ id: 30, title: 'Important only', status: 'todo', isUrgent: false, isImportant: true }),
        createTask({ id: 31, title: 'Both flags', status: 'todo', isUrgent: true, isImportant: true }),
      ];
      setupLiveQuery(tasks);
      render(<TasksView initialStatusFilter="important-not-urgent" />);
      expect(screen.getByText('Important only')).toBeInTheDocument();
      expect(screen.queryByText('Both flags')).not.toBeInTheDocument();
    });

    it('shows empty state when no tasks match filter', () => {
      setupLiveQuery([]);
      render(<TasksView />);
      expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    });
  });

  describe('task item rendering', () => {
    it('renders task title', () => {
      setupLiveQuery([createTask({ id: 40, title: 'My important task', status: 'todo' })]);
      render(<TasksView />);
      expect(screen.getByText('My important task')).toBeInTheDocument();
    });

    it('renders bucket emoji in the task row when task has a matching bucket', () => {
      const bucket = createBucket({ id: 5, emoji: '🚀', name: 'Rockets' });
      const task = createTask({ id: 41, title: 'Rocket task', status: 'todo', bucketId: 5 });
      let call = 0;
      vi.mocked(useLiveQuery).mockImplementation(() => (++call % 2 === 1 ? [task] : [bucket]));
      render(<TasksView />);
      // The emoji appears in both the bucket chip and the task row — check at least one exists
      const emojiEls = screen.getAllByText('🚀');
      expect(emojiEls.length).toBeGreaterThanOrEqual(1);
    });

    it('renders fallback emoji when task has no bucket', () => {
      setupLiveQuery([createTask({ id: 42, title: 'Orphan task', status: 'todo', bucketId: undefined })]);
      render(<TasksView />);
      expect(screen.getByText('📁')).toBeInTheDocument();
    });

    it('calls repository.updateTask with in-progress when todo task toggle is clicked', async () => {
      const task = createTask({ id: 43, title: 'Toggle me', status: 'todo' });
      setupLiveQuery([task]);
      render(<TasksView />);
      // The task toggle button is adjacent to the task title.
      // Find the task card by title, then find the first button within it.
      const taskTitle = screen.getByText('Toggle me');
      // Walk up to the card container (the flex items-center div)
      const taskCard = taskTitle.closest('.flex.items-center.gap-4');
      expect(taskCard).toBeTruthy();
      const taskToggle = taskCard!.querySelector('button');
      expect(taskToggle).toBeTruthy();
      await userEvent.click(taskToggle!);
      await waitFor(() => {
        expect(repository.updateTask).toHaveBeenCalledWith(43, { status: 'in-progress' });
      });
    });

    it('calls repository.updateTask with done when in-progress task toggle is clicked', async () => {
      const task = createTask({ id: 44, title: 'Almost done', status: 'in-progress' });
      setupLiveQuery([task]);
      render(<TasksView />);
      const taskTitle = screen.getByText('Almost done');
      const taskCard = taskTitle.closest('.flex.items-center.gap-4');
      expect(taskCard).toBeTruthy();
      const taskToggle = taskCard!.querySelector('button');
      expect(taskToggle).toBeTruthy();
      await userEvent.click(taskToggle!);
      await waitFor(() => {
        expect(repository.updateTask).toHaveBeenCalledWith(44, { status: 'done' });
      });
    });
  });

  describe('view mode toggle', () => {
    it('switches to quadrant view showing all four quadrant headings', async () => {
      setupLiveQuery([createTask({ id: 50, title: 'Q task', status: 'todo', isUrgent: true, isImportant: true })]);
      render(<TasksView />);
      // The view toggle button is the first button in the header (LayoutGrid icon)
      const allButtons = screen.getAllByRole('button');
      await userEvent.click(allButtons[0]);
      expect(screen.getByText('Urgent + Important')).toBeInTheDocument();
      expect(screen.getByText('Important')).toBeInTheDocument();
      expect(screen.getByText('Urgent')).toBeInTheDocument();
      expect(screen.getByText('Neither')).toBeInTheDocument();
    });

    it('quadrant view places tasks in correct quadrant', async () => {
      const tasks = [
        createTask({ id: 60, title: 'UrgImp', status: 'todo', isUrgent: true, isImportant: true }),
        createTask({ id: 61, title: 'ImpOnly', status: 'todo', isUrgent: false, isImportant: true }),
        createTask({ id: 62, title: 'UrgOnly', status: 'todo', isUrgent: true, isImportant: false }),
        createTask({ id: 63, title: 'NeitherTask', status: 'todo', isUrgent: false, isImportant: false }),
      ];
      setupLiveQuery(tasks);
      render(<TasksView />);
      const allButtons = screen.getAllByRole('button');
      await userEvent.click(allButtons[0]);
      expect(screen.getByText('UrgImp')).toBeInTheDocument();
      expect(screen.getByText('ImpOnly')).toBeInTheDocument();
      expect(screen.getByText('UrgOnly')).toBeInTheDocument();
      expect(screen.getByText('NeitherTask')).toBeInTheDocument();
    });

    it('switches back to list view when toggled again', async () => {
      setupLiveQuery([createTask({ id: 70, title: 'List task', status: 'todo' })]);
      render(<TasksView />);
      const allButtons = screen.getAllByRole('button');
      await userEvent.click(allButtons[0]); // → quadrant
      await userEvent.click(allButtons[0]); // → list
      expect(screen.getByText('List task')).toBeInTheDocument();
      expect(screen.queryByText('Urgent + Important')).not.toBeInTheDocument();
    });
  });

  describe('new task modal (TaskForm)', () => {
    it('task form submits new task to repository', async () => {
      setupLiveQuery([], [createBucket({ id: 1, name: 'Work', emoji: '💼' })]);
      render(<TasksView />);
      // FAB is the last button
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByPlaceholderText("What needs doing?"));
      await userEvent.type(screen.getByPlaceholderText("What needs doing?"), 'Brand new task');
      await userEvent.click(screen.getByText('Create Task'));
      await waitFor(() => {
        expect(repository.addTask).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Brand new task' })
        );
      });
    });

    it('task form does not submit when title is empty', async () => {
      setupLiveQuery();
      render(<TasksView />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByText('Create Task'));
      await userEvent.click(screen.getByText('Create Task'));
      expect(repository.addTask).not.toHaveBeenCalled();
    });

    it('new task defaults to todo status when no filter is active', async () => {
      setupLiveQuery();
      render(<TasksView />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByText('New Task'));
      // The todo status button in the status selector should have the active (orange) style
      const todoBtn = screen.getByRole('button', { name: /^todo$/i });
      expect(todoBtn).toHaveClass('bg-nook-orange');
    });

    it('new task inherits backlog status when backlog filter is active', async () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter="backlog" />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByText('New Task'));
      // The status selector buttons are inside the modal; find all with matching text and pick the active one
      const statusBtns = screen.getAllByRole('button', { name: /^backlog$/i });
      const activeBtn = statusBtns.find(b => b.classList.contains('bg-nook-orange'));
      expect(activeBtn).toBeDefined();
    });

    it('new task inherits in-progress status when in-progress filter is active', async () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter="in-progress" />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByText('New Task'));
      const statusBtns = screen.getAllByRole('button', { name: /^in progress$/i });
      const activeBtn = statusBtns.find(b => b.classList.contains('bg-nook-orange'));
      expect(activeBtn).toBeDefined();
    });

    it('new task defaults to todo when done filter is active', async () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter="done" />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByText('New Task'));
      const todoBtn = screen.getByRole('button', { name: /^todo$/i });
      expect(todoBtn).toHaveClass('bg-nook-orange');
    });

    it('new task defaults to todo when active filter is active', async () => {
      setupLiveQuery();
      render(<TasksView initialStatusFilter="active" />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByText('New Task'));
      const todoBtn = screen.getByRole('button', { name: /^todo$/i });
      expect(todoBtn).toHaveClass('bg-nook-orange');
    });

    it('submits task with backlog status when backlog filter is active', async () => {
      setupLiveQuery([], [createBucket({ id: 1, name: 'Work', emoji: '💼' })]);
      render(<TasksView initialStatusFilter="backlog" />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByPlaceholderText("What needs doing?"));
      await userEvent.type(screen.getByPlaceholderText("What needs doing?"), 'Backlog task');
      await userEvent.click(screen.getByText('Create Task'));
      await waitFor(() => {
        expect(repository.addTask).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Backlog task', status: 'backlog' })
        );
      });
    });

    it('submits task with in-progress status when in-progress filter is active', async () => {
      setupLiveQuery([], [createBucket({ id: 1, name: 'Work', emoji: '💼' })]);
      render(<TasksView initialStatusFilter="in-progress" />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByPlaceholderText("What needs doing?"));
      await userEvent.type(screen.getByPlaceholderText("What needs doing?"), 'WIP task');
      await userEvent.click(screen.getByText('Create Task'));
      await waitFor(() => {
        expect(repository.addTask).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'WIP task', status: 'in-progress' })
        );
      });
    });

    it('edit task ignores initialStatus and uses the task own status', async () => {
      // Use a backlog task so it's visible under the backlog filter
      const task = createTask({ id: 99, title: 'Existing backlog task', status: 'backlog' });
      setupLiveQuery([task]);
      render(<TasksView initialStatusFilter="backlog" />);
      // Click the task card to open edit modal
      await userEvent.click(screen.getByText('Existing backlog task'));
      await waitFor(() => screen.getByText('Edit Task'));
      // The backlog status button should be active since we're editing an existing backlog task
      const statusBtns = screen.getAllByRole('button', { name: /^backlog$/i });
      const activeBtn = statusBtns.find(b => b.classList.contains('bg-nook-orange'));
      expect(activeBtn).toBeDefined();
    });
  });

  describe('bucket manager modal (BucketManager)', () => {
    // The Settings2 (bucket manager) button is the second SVG-only icon button in the header.
    // Header icon buttons: [0]=list/quadrant toggle, [1]=bucket manager (Settings2)
    // FAB also has SVG and empty text but appears last.
    function getBucketManagerBtn() {
      const allBtns = screen.getAllByRole('button');
      const svgOnlyBtns = allBtns.filter(b => {
        const svgs = b.querySelectorAll('svg');
        return svgs.length > 0 && b.textContent?.trim() === '';
      });
      // First two svg-only buttons are the header icons; second is bucket manager
      return svgOnlyBtns[1];
    }

    it('opens bucket manager modal when settings icon is clicked', async () => {
      setupLiveQuery([], []);
      render(<TasksView />);
      await userEvent.click(getBucketManagerBtn());
      await waitFor(() => {
        expect(screen.getByText('Manage Buckets')).toBeInTheDocument();
      });
    });

    it('shows existing buckets in the bucket manager', async () => {
      const buckets = [createBucket({ id: 1, name: 'My Bucket', emoji: '🎯' })];
      setupLiveQuery([], buckets);
      render(<TasksView />);
      await userEvent.click(getBucketManagerBtn());
      await waitFor(() => screen.getByText('Manage Buckets'));
      // Bucket name appears in the manager list
      expect(screen.getAllByText('My Bucket').length).toBeGreaterThanOrEqual(1);
    });

    it('shows add bucket form when Add New Bucket is clicked', async () => {
      setupLiveQuery([], []);
      render(<TasksView />);
      await userEvent.click(getBucketManagerBtn());
      await waitFor(() => screen.getByText('Manage Buckets'));
      await userEvent.click(screen.getByText('Add New Bucket'));
      expect(screen.getByPlaceholderText('Bucket name')).toBeInTheDocument();
    });

    it('calls repository.addBucket with name and emoji', async () => {
      setupLiveQuery([], []);
      render(<TasksView />);
      await userEvent.click(getBucketManagerBtn());
      await waitFor(() => screen.getByText('Manage Buckets'));
      await userEvent.click(screen.getByText('Add New Bucket'));
      await userEvent.type(screen.getByPlaceholderText('Bucket name'), 'My New Bucket');
      await userEvent.click(screen.getByText('Add'));
      await waitFor(() => {
        expect(repository.addBucket).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'My New Bucket' })
        );
      });
    });

    it('does not call addBucket when name is empty', async () => {
      setupLiveQuery([], []);
      render(<TasksView />);
      await userEvent.click(getBucketManagerBtn());
      await waitFor(() => screen.getByText('Manage Buckets'));
      await userEvent.click(screen.getByText('Add New Bucket'));
      await userEvent.click(screen.getByText('Add'));
      expect(repository.addBucket).not.toHaveBeenCalled();
    });
  });

  describe('inbox filter view', () => {
    it('shows loading state while fetching inbox items', async () => {
      // Make fetchPendingInboxItems never resolve during this test
      let resolve: (items: InboxItem[]) => void;
      mockFetchPendingInboxItems.mockReturnValueOnce(new Promise(r => { resolve = r; }));
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      expect(await screen.findByText('Loading inbox...')).toBeInTheDocument();
      // Resolve to clean up
      resolve!([]);
    });

    it('shows empty state when no pending inbox items', async () => {
      mockFetchPendingInboxItems.mockResolvedValueOnce([]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      expect(await screen.findByText('No pending inbox tasks.')).toBeInTheDocument();
    });

    it('renders inbox item title', async () => {
      mockFetchPendingInboxItems.mockResolvedValueOnce([
        createInboxItem({ title: 'Buy birthday cake' }),
      ]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      expect(await screen.findByText('Buy birthday cake')).toBeInTheDocument();
    });

    it('renders contributor email in inbox item', async () => {
      mockFetchPendingInboxItems.mockResolvedValueOnce([
        createInboxItem({ contributorEmail: 'partner@example.com' }),
      ]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      expect(await screen.findByText(/partner@example\.com/i)).toBeInTheDocument();
    });

    it('renders Accept and Decline buttons for each inbox item', async () => {
      mockFetchPendingInboxItems.mockResolvedValueOnce([
        createInboxItem({ id: 'item-1', title: 'Task A' }),
      ]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      expect(await screen.findByRole('button', { name: /accept/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
    });

    it('calls fetchPendingInboxItems with owner uid on mount', async () => {
      mockFetchPendingInboxItems.mockResolvedValueOnce([]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      await waitFor(() => {
        expect(mockFetchPendingInboxItems).toHaveBeenCalledWith('owner-123');
      });
    });

    it('hides FAB when in inbox view', async () => {
      mockFetchPendingInboxItems.mockResolvedValueOnce([]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      await screen.findByText('No pending inbox tasks.');
      // FAB button (Plus icon) should not be present
      const allButtons = screen.getAllByRole('button');
      // FAB is typically the last button and has no text content — verify none have bottom-24 class
      const fabLike = allButtons.filter(b => b.className.includes('bottom-24'));
      expect(fabLike).toHaveLength(0);
    });

    it('clicking Accept calls repository.addTask then acceptInboxItem', async () => {
      const item = createInboxItem({ id: 'inbox-abc', title: 'Urgent task', isUrgent: true, isImportant: true });
      mockFetchPendingInboxItems.mockResolvedValueOnce([item]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      const acceptBtn = await screen.findByRole('button', { name: /accept/i });
      await userEvent.click(acceptBtn);
      await waitFor(() => {
        expect(repository.addTask).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Urgent task',
            status: 'todo',
            isUrgent: true,
            isImportant: true,
            contributorUID: 'contrib-456',
          })
        );
        expect(mockAcceptInboxItem).toHaveBeenCalledWith('owner-123', 'inbox-abc', 1);
      });
    });

    it('accepted item is removed from the list after acceptance', async () => {
      const item = createInboxItem({ id: 'inbox-gone', title: 'About to be accepted' });
      mockFetchPendingInboxItems.mockResolvedValueOnce([item]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      const acceptBtn = await screen.findByRole('button', { name: /accept/i });
      await userEvent.click(acceptBtn);
      await waitFor(() => {
        expect(screen.queryByText('About to be accepted')).not.toBeInTheDocument();
      });
    });

    it('clicking Decline calls declineInboxItem', async () => {
      const item = createInboxItem({ id: 'inbox-decline', title: 'Declined task' });
      mockFetchPendingInboxItems.mockResolvedValueOnce([item]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      const declineBtn = await screen.findByRole('button', { name: /decline/i });
      await userEvent.click(declineBtn);
      await waitFor(() => {
        expect(mockDeclineInboxItem).toHaveBeenCalledWith('owner-123', 'inbox-decline');
      });
    });

    it('declined item is removed from the list after declining', async () => {
      const item = createInboxItem({ id: 'inbox-bye', title: 'Going away' });
      mockFetchPendingInboxItems.mockResolvedValueOnce([item]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      const declineBtn = await screen.findByRole('button', { name: /decline/i });
      await userEvent.click(declineBtn);
      await waitFor(() => {
        expect(screen.queryByText('Going away')).not.toBeInTheDocument();
      });
    });

    it('shows inbox filter chip in the top bar', async () => {
      mockFetchPendingInboxItems.mockResolvedValueOnce([]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      // The "inbox" text should appear in the filter chip
      expect(screen.getByText('inbox')).toBeInTheDocument();
    });

    it('shows due date when inbox item has a dueDate', async () => {
      // Use local date construction to avoid UTC timezone shifting (e.g., Mar 15 UTC → Mar 14 local)
      const dueDate = new Date(2025, 2, 15); // month is 0-indexed: 2 = March
      const item = createInboxItem({ dueDate });
      mockFetchPendingInboxItems.mockResolvedValueOnce([item]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      expect(await screen.findByText(/Mar 15/i)).toBeInTheDocument();
    });

    it('shows details when inbox item has details', async () => {
      const item = createInboxItem({ details: 'Extra context here' });
      mockFetchPendingInboxItems.mockResolvedValueOnce([item]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      expect(await screen.findByText('Extra context here')).toBeInTheDocument();
    });

    it('re-fetches inbox items when pull-to-refresh onRefresh is triggered', async () => {
      mockFetchPendingInboxItems.mockResolvedValue([]);
      setupLiveQuery();
      render(<TasksView initialStatusFilter="inbox" />);
      await screen.findByText('No pending inbox tasks.');

      // Grab the onRefresh callback captured by the mocked usePullToRefresh hook
      const capturedOnRefresh = vi.mocked(usePullToRefresh).mock.calls[0][0].onRefresh;
      mockFetchPendingInboxItems.mockClear();
      await capturedOnRefresh();

      await waitFor(() => {
        expect(mockFetchPendingInboxItems).toHaveBeenCalledWith('owner-123');
      });
    });
  });
});
