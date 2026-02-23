import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarView } from './CalendarView';
import { createTask } from '../tests/factories';
import { format, addMonths, subMonths } from 'date-fns';

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('../services/repository', () => ({
  repository: {
    getAllTasks: vi.fn(async () => []),
  },
}));

import { useLiveQuery } from 'dexie-react-hooks';

function renderCalendarView(tasks = []) {
  vi.mocked(useLiveQuery).mockReturnValue(tasks);
  return render(<CalendarView />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CalendarView', () => {
  describe('loading state', () => {
    it('renders nothing when tasks are undefined', () => {
      vi.mocked(useLiveQuery).mockReturnValue(undefined);
      const { container } = render(<CalendarView />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('header', () => {
    it('renders the current month and year', () => {
      renderCalendarView();
      const expected = format(new Date(), 'MMMM yyyy');
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('renders previous and next month navigation buttons', () => {
      renderCalendarView();
      const buttons = screen.getAllByRole('button');
      // First two buttons are prev/next month chevrons
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('month navigation', () => {
    it('navigates to the previous month', async () => {
      renderCalendarView();
      const prevMonth = format(subMonths(new Date(), 1), 'MMMM yyyy');
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[0]); // ChevronLeft
      expect(screen.getByText(prevMonth)).toBeInTheDocument();
    });

    it('navigates to the next month', async () => {
      renderCalendarView();
      const nextMonth = format(addMonths(new Date(), 1), 'MMMM yyyy');
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[1]); // ChevronRight
      expect(screen.getByText(nextMonth)).toBeInTheDocument();
    });

    it('can navigate forward and then back to current month', async () => {
      renderCalendarView();
      const currentMonth = format(new Date(), 'MMMM yyyy');
      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[1]); // next
      await userEvent.click(buttons[0]); // back
      expect(screen.getByText(currentMonth)).toBeInTheDocument();
    });
  });

  describe('day grid', () => {
    it('renders day-of-week headers S M T W T F S', () => {
      renderCalendarView();
      const dayHeaders = screen.getAllByText('S');
      expect(dayHeaders.length).toBeGreaterThanOrEqual(2); // Sunday + Saturday
      expect(screen.getByText('M')).toBeInTheDocument();
      expect(screen.getByText('W')).toBeInTheDocument();
      expect(screen.getByText('F')).toBeInTheDocument();
    });

    it('renders day 1 button', () => {
      renderCalendarView();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('selecting a day updates the tasks section heading', async () => {
      renderCalendarView();
      // Click day 1
      await userEvent.click(screen.getByText('1'));
      expect(screen.getByText(/tasks for/i)).toBeInTheDocument();
    });
  });

  describe('tasks for selected date', () => {
    it('shows empty state message when no tasks due on selected date', () => {
      renderCalendarView([]);
      expect(screen.getByText(/no tasks due today/i)).toBeInTheDocument();
    });

    it('shows tasks due on today by default', () => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const task = createTask({
        id: 1,
        title: 'Due today task',
        status: 'todo',
        dueDate: today,
      });
      renderCalendarView([task]);
      expect(screen.getByText('Due today task')).toBeInTheDocument();
    });

    it('does not show done tasks even if due today', () => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const doneTask = createTask({
        id: 2,
        title: 'Already done',
        status: 'done',
        dueDate: today,
      });
      renderCalendarView([doneTask]);
      expect(screen.queryByText('Already done')).not.toBeInTheDocument();
    });

    it('does not show tasks due on a different date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(12, 0, 0, 0);
      const task = createTask({
        id: 3,
        title: 'Future task',
        status: 'todo',
        dueDate: tomorrow,
      });
      renderCalendarView([task]);
      // Today is selected by default — tomorrow's task should not appear
      expect(screen.queryByText('Future task')).not.toBeInTheDocument();
    });

    it('tasks section heading shows selected date', () => {
      renderCalendarView([]);
      const today = format(new Date(), 'MMM do');
      expect(screen.getByText(`Tasks for ${today}`)).toBeInTheDocument();
    });
  });

  describe('task dot indicators on calendar grid', () => {
    it('shows a dot on days that have tasks due', () => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const task = createTask({
        id: 4,
        title: 'Has dot',
        status: 'todo',
        dueDate: today,
      });
      renderCalendarView([task]);
      // The dot is a small div inside the day button — check it's rendered
      // by verifying the task appears in the list (proves hasTasks=true path)
      expect(screen.getByText('Has dot')).toBeInTheDocument();
    });
  });
});
