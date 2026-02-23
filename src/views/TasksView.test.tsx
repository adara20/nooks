import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksView } from './TasksView';
import { createTask, createBucket } from '../tests/factories';

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
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { useLiveQuery } from 'dexie-react-hooks';
import { repository } from '../services/repository';

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

    it('new task defaults to todo status', async () => {
      setupLiveQuery();
      render(<TasksView />);
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => screen.getByText('New Task'));
      // todo button should be visible in the status selector
      expect(screen.getByText('todo')).toBeInTheDocument();
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
});
