import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { repository } from './services/repository';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./services/repository', () => ({
  repository: {
    seedIfEmpty: vi.fn(async () => {}),
  },
}));

// Mock AuthContext so App doesn't need a real Firebase connection
vi.mock('./context/AuthContext', () => ({
  useAuth: () => ({ authLoading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./views/HomeView', () => ({
  HomeView: ({ onNavigateToTasks, onNavigateToSettings }: {
    onNavigateToTasks: (f: string | null) => void;
    onNavigateToSettings: () => void;
  }) => (
    <div>
      <span>HomeView</span>
      <button onClick={() => onNavigateToTasks('active')}>Go Tasks Active</button>
      <button onClick={() => onNavigateToTasks('done')}>Go Tasks Done</button>
      <button onClick={onNavigateToSettings}>Go Settings</button>
    </div>
  ),
}));

vi.mock('./views/TasksView', () => ({
  TasksView: ({ initialStatusFilter, onClearFilter }: {
    initialStatusFilter: string | null;
    onClearFilter: () => void;
  }) => (
    <div>
      <span>TasksView</span>
      <span data-testid="filter">{initialStatusFilter ?? 'none'}</span>
      <button onClick={onClearFilter}>Clear Filter</button>
    </div>
  ),
}));

vi.mock('./views/CalendarView', () => ({
  CalendarView: () => <div>CalendarView</div>,
}));

vi.mock('./views/SettingsView', () => ({
  SettingsView: ({ onBack }: { onBack: () => void }) => (
    <div>
      <span>SettingsView</span>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repository.seedIfEmpty).mockResolvedValue(undefined);
});

async function renderApp() {
  render(<App />);
  await waitFor(() => {
    expect(screen.queryByText('Finding your nooks...')).not.toBeInTheDocument();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('App', () => {
  describe('initialisation', () => {
    it('shows loading spinner before seed completes', () => {
      vi.mocked(repository.seedIfEmpty).mockReturnValue(new Promise(() => {}));
      render(<App />);
      expect(screen.getByText('Finding your nooks...')).toBeInTheDocument();
    });

    it('shows HomeView after seed completes', async () => {
      await renderApp();
      expect(screen.getByText('HomeView')).toBeInTheDocument();
    });

    it('calls seedIfEmpty exactly once on mount', async () => {
      await renderApp();
      expect(repository.seedIfEmpty).toHaveBeenCalledOnce();
    });

    it('shows loading spinner while authLoading is true', () => {
      vi.doMock('./context/AuthContext', () => ({
        useAuth: () => ({ authLoading: true }),
        AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      }));
      vi.mocked(repository.seedIfEmpty).mockResolvedValue(undefined);
      render(<App />);
      expect(screen.getByText('Finding your nooks...')).toBeInTheDocument();
    });
  });

  describe('bottom navigation', () => {
    it('renders BottomNav after init', async () => {
      await renderApp();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('navigates to TasksView when Tasks tab is clicked', async () => {
      await renderApp();
      await userEvent.click(screen.getByRole('button', { name: 'Tasks' }));
      expect(screen.getByText('TasksView')).toBeInTheDocument();
    });

    it('navigates to CalendarView when Calendar tab is clicked', async () => {
      await renderApp();
      await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
      expect(screen.getByText('CalendarView')).toBeInTheDocument();
    });

    it('navigates back to HomeView when Home tab is clicked', async () => {
      await renderApp();
      await userEvent.click(screen.getByRole('button', { name: 'Tasks' }));
      await userEvent.click(screen.getByRole('button', { name: 'Home' }));
      expect(screen.getByText('HomeView')).toBeInTheDocument();
    });

    it('hides BottomNav when SettingsView is active', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Settings'));
      expect(screen.getByText('SettingsView')).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('restores BottomNav when Back is clicked from Settings', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Settings'));
      await userEvent.click(screen.getByText('Back'));
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('navigation from HomeView', () => {
    it('navigates to TasksView with active filter', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Tasks Active'));
      expect(screen.getByText('TasksView')).toBeInTheDocument();
      expect(screen.getByTestId('filter').textContent).toBe('active');
    });

    it('navigates to TasksView with done filter', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Tasks Done'));
      expect(screen.getByTestId('filter').textContent).toBe('done');
    });

    it('navigates to SettingsView from HomeView', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Settings'));
      expect(screen.getByText('SettingsView')).toBeInTheDocument();
    });
  });

  describe('filter state management', () => {
    it('clears status filter when switching to a non-tasks tab', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Tasks Active'));
      expect(screen.getByTestId('filter').textContent).toBe('active');
      await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
      await userEvent.click(screen.getByRole('button', { name: 'Tasks' }));
      expect(screen.getByTestId('filter').textContent).toBe('none');
    });

    it('preserves filter when Tasks tab is re-clicked while already on Tasks', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Tasks Active'));
      await userEvent.click(screen.getByRole('button', { name: 'Tasks' }));
      expect(screen.getByTestId('filter').textContent).toBe('active');
    });

    it('clears filter when onClearFilter is called from TasksView', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Tasks Active'));
      await userEvent.click(screen.getByText('Clear Filter'));
      expect(screen.getByTestId('filter').textContent).toBe('none');
    });
  });

  describe('settings view', () => {
    it('returns to HomeView when Back is clicked from Settings', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Settings'));
      await userEvent.click(screen.getByText('Back'));
      expect(screen.getByText('HomeView')).toBeInTheDocument();
    });

    it('Home tab is still rendered in BottomNav after returning from Settings', async () => {
      await renderApp();
      await userEvent.click(screen.getByText('Go Settings'));
      await userEvent.click(screen.getByText('Back'));
      expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    });
  });
});
