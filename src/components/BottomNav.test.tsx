import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomNav } from './BottomNav';

describe('BottomNav', () => {
  it('renders all three tabs', () => {
    render(<BottomNav activeTab="home" onTabChange={() => {}} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('calls onTabChange with correct tab when Home is clicked', async () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="tasks" onTabChange={onTabChange} />);
    await userEvent.click(screen.getByText('Home'));
    expect(onTabChange).toHaveBeenCalledWith('home');
  });

  it('calls onTabChange with correct tab when Tasks is clicked', async () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="home" onTabChange={onTabChange} />);
    await userEvent.click(screen.getByText('Tasks'));
    expect(onTabChange).toHaveBeenCalledWith('tasks');
  });

  it('calls onTabChange with correct tab when Calendar is clicked', async () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="home" onTabChange={onTabChange} />);
    await userEvent.click(screen.getByText('Calendar'));
    expect(onTabChange).toHaveBeenCalledWith('calendar');
  });

  it('applies active styles to the active tab', () => {
    render(<BottomNav activeTab="home" onTabChange={() => {}} />);
    const homeBtn = screen.getByText('Home').closest('button');
    expect(homeBtn?.className).toContain('text-nook-orange');
  });

  it('applies inactive styles to non-active tabs', () => {
    render(<BottomNav activeTab="home" onTabChange={() => {}} />);
    const tasksBtn = screen.getByText('Tasks').closest('button');
    expect(tasksBtn?.className).toContain('text-nook-ink/40');
  });
});
