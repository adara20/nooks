import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function renderIndicator(
  pullDistance: number,
  isRefreshing: boolean,
  threshold = 80,
) {
  return render(
    <PullToRefreshIndicator
      pullDistance={pullDistance}
      isRefreshing={isRefreshing}
      threshold={threshold}
    />,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('PullToRefreshIndicator', () => {
  describe('visibility', () => {
    it('renders nothing when pullDistance is 0 and not refreshing', () => {
      const { container } = renderIndicator(0, false);
      expect(container.firstChild).toBeNull();
    });

    it('renders when pullDistance > 0', () => {
      renderIndicator(30, false);
      expect(screen.getByLabelText('Pull to refresh')).toBeInTheDocument();
    });

    it('renders when isRefreshing is true even with pullDistance 0', () => {
      renderIndicator(0, true);
      expect(screen.getByLabelText('Refreshing')).toBeInTheDocument();
    });
  });

  describe('aria-label', () => {
    it('shows aria-label "Pull to refresh" when not refreshing', () => {
      renderIndicator(40, false);
      expect(screen.getByLabelText('Pull to refresh')).toBeInTheDocument();
    });

    it('shows aria-label "Refreshing" when isRefreshing is true', () => {
      renderIndicator(0, true);
      expect(screen.getByLabelText('Refreshing')).toBeInTheDocument();
    });
  });

  describe('label text', () => {
    it('shows "Refreshing…" when pullDistance is below threshold', () => {
      renderIndicator(40, false, 80);
      expect(screen.getByText('Refreshing…')).toBeInTheDocument();
    });

    it('shows "Release" when pullDistance meets or exceeds threshold', () => {
      renderIndicator(80, false, 80);
      expect(screen.getByText('Release')).toBeInTheDocument();
    });

    it('shows "Refreshing…" while isRefreshing (pullDistance is 0)', () => {
      renderIndicator(0, true);
      expect(screen.getByText('Refreshing…')).toBeInTheDocument();
    });
  });

  describe('spinner vs icon', () => {
    it('shows the spinner (animate-spin) when isRefreshing is true', () => {
      renderIndicator(0, true);
      const spinner = document.querySelector('[data-testid="ptr-spinner"]');
      expect(spinner).toBeInTheDocument();
    });

    it('shows the RefreshCw icon when not refreshing', () => {
      renderIndicator(40, false);
      const icon = document.querySelector('[data-testid="ptr-icon"]');
      expect(icon).toBeInTheDocument();
    });

    it('does NOT show spinner when not refreshing', () => {
      renderIndicator(40, false);
      const spinner = document.querySelector('[data-testid="ptr-spinner"]');
      expect(spinner).not.toBeInTheDocument();
    });

    it('does NOT show the RefreshCw icon when refreshing', () => {
      renderIndicator(0, true);
      const icon = document.querySelector('[data-testid="ptr-icon"]');
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe('translateY positioning', () => {
    it('clamps translateY to 12px when isRefreshing', () => {
      renderIndicator(0, true);
      const pill = screen.getByLabelText('Refreshing');
      expect(pill.style.transform).toContain('translateY(12px)');
    });

    it('slides proportionally when pulling (pullDistance 44 → translateY 0)', () => {
      renderIndicator(44, false);
      const pill = screen.getByLabelText('Pull to refresh');
      // translateY = min(44 - 44, 12) = 0
      expect(pill.style.transform).toContain('translateY(0px)');
    });

    it('caps translateY at 12px when pullDistance is very large', () => {
      renderIndicator(200, false);
      const pill = screen.getByLabelText('Pull to refresh');
      expect(pill.style.transform).toContain('translateY(12px)');
    });
  });

  describe('opacity', () => {
    it('is 1 when isRefreshing', () => {
      renderIndicator(0, true);
      const pill = screen.getByLabelText('Refreshing');
      expect(parseFloat(pill.style.opacity)).toBe(1);
    });

    it('is 0 when pullDistance is at or below 20px', () => {
      renderIndicator(20, false, 80);
      const pill = screen.getByLabelText('Pull to refresh');
      expect(parseFloat(pill.style.opacity)).toBe(0);
    });

    it('increases proportionally between 20px and threshold', () => {
      // At pull=50, threshold=80: (50-20)/(80-20) = 0.5
      renderIndicator(50, false, 80);
      const pill = screen.getByLabelText('Pull to refresh');
      const opacity = parseFloat(pill.style.opacity);
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
    });

    it('is 1 when pullDistance exceeds threshold', () => {
      renderIndicator(100, false, 80);
      const pill = screen.getByLabelText('Pull to refresh');
      expect(parseFloat(pill.style.opacity)).toBe(1);
    });
  });
});
