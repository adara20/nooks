import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card } from './Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello card</Card>);
    expect(screen.getByText('Hello card')).toBeInTheDocument();
  });

  it('calls onClick when clicked and onClick is provided', async () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Clickable</Card>);
    await userEvent.click(screen.getByText('Clickable'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('adds cursor-pointer class when onClick is provided', () => {
    const { container } = render(<Card onClick={() => {}}>Clickable</Card>);
    expect(container.firstChild).toHaveClass('cursor-pointer');
  });

  it('does not add cursor-pointer class when onClick is not provided', () => {
    const { container } = render(<Card>Static</Card>);
    expect(container.firstChild).not.toHaveClass('cursor-pointer');
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">Content</Card>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('always renders with base card styles', () => {
    const { container } = render(<Card>Base styles</Card>);
    expect(container.firstChild).toHaveClass('rounded-2xl');
  });
});
