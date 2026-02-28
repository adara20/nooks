import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeView } from './HomeView';
import { createTask } from '../tests/factories';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

// Mock nudgeService so we control nudge output directly
import type { Nudge } from '../services/nudgeService';
const mockGenerateNudges = vi.fn((_tasks?: unknown, _date?: unknown, _isSignedIn?: unknown, _inboxCount?: unknown): Nudge[] => []);
vi.mock('../services/nudgeService', () => ({
  generateNudges: (...args: Parameters<typeof import("../services/nudgeService").generateNudges>) => mockGenerateNudges(...args),
}));

vi.mock('../services/backupService', () => ({
  getLastExportDate: vi.fn(() => null),
}));

const mockUseAuth = vi.fn(() => ({ isSignedIn: false as boolean, user: null as { uid: string } | null }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/usePullToRefresh', () => ({
  usePullToRefresh: vi.fn(() => ({ pullDistance: 0, isRefreshing: false })),
}));

vi.mock('../services/contributorService', () => ({
  getPendingInboxCount: vi.fn(async () => 0),
  getAppMode: vi.fn(() => 'owner'),
}));

vi.mock('../services/repository', () => ({
  repository: {
    getAllTasks: vi.fn(async () => []),
    getAllBuckets: vi.fn(async () => []),
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

import { useLiveQuery } from 'dexie-react-hooks';
import type { generateNudges as GenerateNudgesType } from '../services/nudgeService';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { getPendingInboxCount } from '../services/contributorService';

const mockOnNavigateToTasks = vi.fn();
const mockOnNavigateToSettings = vi.fn();

function renderHomeView(tasks = [], buckets = []) {
  vi.mocked(useLiveQuery)
    .mockReturnValueOnce(tasks)
    .mockReturnValueOnce(buckets);
  return render(
    <HomeView
      onNavigateToTasks={mockOnNavigateToTasks}
      onNavigateToSettings={mockOnNavigateToSettings}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no nudges
  mockGenerateNudges.mockReturnValue([]);
  // Default: not signed in
  mockUseAuth.mockReturnValue({ isSignedIn: false, user: null });
});

describe('HomeView', () => {
  describe('loading state', () => {
    it('renders nothing when tasks are undefined', () => {
      vi.mocked(useLiveQuery).mockReturnValueOnce(undefined).mockReturnValueOnce([]);
      const { container } = render(
        <HomeView onNavigateToTasks={mockOnNavigateToTasks} onNavigateToSettings={mockOnNavigateToSettings} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when buckets are undefined', () => {
      vi.mocked(useLiveQuery).mockReturnValueOnce([]).mockReturnValueOnce(undefined);
      const { container } = render(
        <HomeView onNavigateToTasks={mockOnNavigateToTasks} onNavigateToSettings={mockOnNavigateToSettings} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('header', () => {
    it('renders the greeting headline', () => {
      renderHomeView();
      expect(screen.getByText('Hey there.')).toBeInTheDocument();
    });

    it('renders the subtitle', () => {
      renderHomeView();
      expect(screen.getByText("Let's find some nooks to fill.")).toBeInTheDocument();
    });

    it('renders the Settings gear button', () => {
      renderHomeView();
      expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    });

    it('calls onNavigateToSettings when gear icon is clicked', async () => {
      renderHomeView();
      await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
      expect(mockOnNavigateToSettings).toHaveBeenCalledOnce();
    });
  });

  describe('task count stat cards', () => {
    it('shows zero counts for all cards when no tasks', () => {
      renderHomeView([]);
      const counts = screen.getAllByText('0');
      expect(counts.length).toBe(4); // active, done, in-progress, backlog
    });

    it('correctly counts active tasks as todo + in-progress only', () => {
      const tasks = [
        createTask({ status: 'todo' }),
        createTask({ status: 'in-progress' }),
        createTask({ status: 'done' }),
        createTask({ status: 'backlog' }),
      ];
      renderHomeView(tasks);
      // Active = 2 (todo + in-progress), Done = 1, InProgress = 1, Backlog = 1
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(3);
    });

    it('counts done tasks correctly', () => {
      const tasks = [
        createTask({ status: 'done' }),
        createTask({ status: 'done' }),
      ];
      renderHomeView(tasks);
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    });

    it('counts backlog tasks correctly', () => {
      const tasks = [
        createTask({ status: 'backlog' }),
        createTask({ status: 'backlog' }),
        createTask({ status: 'backlog' }),
      ];
      renderHomeView(tasks);
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    });

    it('renders all four stat card labels', () => {
      renderHomeView([]);
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Backlog')).toBeInTheDocument();
    });
  });

  describe('stat card navigation', () => {
    it('clicking Active card calls onNavigateToTasks with active', async () => {
      renderHomeView([]);
      await userEvent.click(screen.getByText('Active'));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('active');
    });

    it('clicking Done card calls onNavigateToTasks with done', async () => {
      renderHomeView([]);
      await userEvent.click(screen.getByText('Done'));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('done');
    });

    it('clicking In Progress card calls onNavigateToTasks with in-progress', async () => {
      renderHomeView([]);
      await userEvent.click(screen.getByText('In Progress'));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('in-progress');
    });

    it('clicking Backlog card calls onNavigateToTasks with backlog', async () => {
      renderHomeView([]);
      await userEvent.click(screen.getByText('Backlog'));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('backlog');
    });
  });

  describe('nudge section', () => {
    it('renders the Nudges section heading', () => {
      renderHomeView([]);
      expect(screen.getByText('Nudges')).toBeInTheDocument();
    });

    it('shows backup-overdue nudge message when nudgeService returns one', () => {
      mockGenerateNudges.mockReturnValue([
        { id: 'backup-overdue', message: 'No backup yet. Head to Settings to save a copy of your nooks.', type: 'gentle' },
      ]);
      renderHomeView([]);
      expect(screen.getByText(/no backup yet/i)).toBeInTheDocument();
    });

    it('backup-overdue nudge click calls onNavigateToSettings', async () => {
      mockGenerateNudges.mockReturnValue([
        { id: 'backup-overdue', message: 'No backup yet. Head to Settings to save a copy of your nooks.', type: 'gentle' },
      ]);
      renderHomeView([]);
      await userEvent.click(screen.getByText(/no backup yet/i));
      expect(mockOnNavigateToSettings).toHaveBeenCalled();
    });

    it('shows no nudges when nudgeService returns empty array', () => {
      mockGenerateNudges.mockReturnValue([]);
      renderHomeView([]);
      // Only the Nudges heading should be present, no cards
      expect(screen.queryByText(/no backup yet/i)).not.toBeInTheDocument();
    });

    it('shows urgent-important nudge message when nudgeService returns one', () => {
      mockGenerateNudges.mockReturnValue([
        { id: 'urgent-important', message: 'You have urgent + important tasks screaming for attention.', type: 'urgent' },
      ]);
      renderHomeView([]);
      expect(screen.getByText(/urgent/i)).toBeInTheDocument();
    });

    it('urgent-important nudge click calls onNavigateToTasks with urgent-important', async () => {
      mockGenerateNudges.mockReturnValue([
        { id: 'urgent-important', message: 'You have urgent + important tasks screaming for attention.', type: 'urgent' },
      ]);
      renderHomeView([]);
      await userEvent.click(screen.getByText(/urgent/i));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('urgent-important');
    });

    it('important-not-urgent nudge click calls onNavigateToTasks with important-not-urgent', async () => {
      mockGenerateNudges.mockReturnValue([
        { id: 'important-not-urgent', message: 'Some important tasks need scheduling.', type: 'important' },
      ]);
      renderHomeView([]);
      await userEvent.click(screen.getByText(/important tasks/i));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('important-not-urgent');
    });

    it('backlog nudge click calls onNavigateToTasks with backlog', async () => {
      mockGenerateNudges.mockReturnValue([
        { id: 'backlog-nudge', message: 'Your backlog is getting long. Time to triage.', type: 'gentle' },
      ]);
      renderHomeView([]);
      await userEvent.click(screen.getByText(/your backlog is getting long/i));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('backlog');
    });

    it('other nudge click calls onNavigateToTasks with active', async () => {
      mockGenerateNudges.mockReturnValue([
        { id: 'praise', message: 'Great work today!', type: 'praise' },
      ]);
      renderHomeView([]);
      await userEvent.click(screen.getByText(/great work/i));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('active');
    });

    it('passes isSignedIn=false to generateNudges when not signed in', () => {
      renderHomeView([]);
      expect(mockGenerateNudges).toHaveBeenCalledOnce();
      const [, , isSignedInArg] = mockGenerateNudges.mock.calls[0] as [unknown, unknown, boolean, number];
      expect(isSignedInArg).toBe(false);
    });

    it('inbox-pending nudge click calls onNavigateToTasks with inbox', async () => {
      mockGenerateNudges.mockReturnValue([
        { id: 'inbox-pending', message: '💌 2 tasks from your partner are waiting for your review.', type: 'gentle' },
      ]);
      renderHomeView([]);
      await userEvent.click(screen.getByText(/waiting for your review/i));
      expect(mockOnNavigateToTasks).toHaveBeenCalledWith('inbox');
    });

    it('passes pendingInboxCount=0 to generateNudges by default', () => {
      renderHomeView([]);
      expect(mockGenerateNudges).toHaveBeenCalledOnce();
      const [, , , inboxCountArg] = mockGenerateNudges.mock.calls[0] as [unknown, unknown, boolean, number];
      expect(inboxCountArg).toBe(0);
    });
  });

  describe('pull-to-refresh', () => {
    it('re-fetches pending inbox count when onRefresh is triggered as signed-in owner', async () => {
      // Arrange: sign in as owner so fetchInboxCount actually calls the service
      mockUseAuth.mockReturnValue({ isSignedIn: true, user: { uid: 'owner-uid' } });
      vi.mocked(getPendingInboxCount).mockResolvedValue(3);
      renderHomeView();

      // Act: grab the onRefresh callback passed to the (mocked) hook and invoke it
      const capturedOnRefresh = vi.mocked(usePullToRefresh).mock.calls[0][0].onRefresh;
      vi.mocked(getPendingInboxCount).mockClear();
      await act(async () => { await capturedOnRefresh(); });

      // Assert: the inbox count was re-fetched
      await waitFor(() => {
        expect(vi.mocked(getPendingInboxCount)).toHaveBeenCalledWith('owner-uid');
      });
    });
  });
});
