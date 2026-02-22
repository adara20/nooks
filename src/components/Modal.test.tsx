import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Test"><p>Content</p></Modal>);
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('renders title and children when isOpen is true', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="My Modal"><p>Inner content</p></Modal>);
    expect(screen.getByText('My Modal')).toBeInTheDocument();
    expect(screen.getByText('Inner content')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Modal"><p>Content</p></Modal>);
    // The X button is the close trigger
    const closeBtn = screen.getByRole('button');
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={onClose} title="Modal"><p>Content</p></Modal>
    );
    // The backdrop is the first fixed div (the overlay)
    const backdrop = container.querySelector('.fixed.inset-0');
    if (backdrop) await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
