import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fire a touch event on the window.
 * jsdom doesn't implement Touch/TouchEvent constructors, so we dispatch a
 * plain Event and manually attach the `touches` property that the hook reads.
 */
function touch(type: 'touchstart' | 'touchmove' | 'touchend', clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  // Attach the touches array expected by the hook
  Object.defineProperty(event, 'touches', {
    value: type !== 'touchend' ? [{ clientY }] : [],
  });
  Object.defineProperty(event, 'changedTouches', {
    value: [{ clientY }],
  });
  window.dispatchEvent(event);
}

function simulatePull(startY: number, endY: number) {
  touch('touchstart', startY);
  touch('touchmove', endY);
  act(() => { touch('touchend', endY); });
}

beforeEach(() => {
  // Default: page is at the top
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
  vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('usePullToRefresh', () => {
  describe('threshold behaviour', () => {
    it('calls onRefresh when pull exceeds threshold', async () => {
      const onRefresh = vi.fn(async () => {});
      renderHook(() => usePullToRefresh({ onRefresh, threshold: 80 }));

      // Pull far enough (delta * 0.4 >= 80 means delta >= 200)
      await act(async () => { simulatePull(0, 220); });

      expect(onRefresh).toHaveBeenCalledOnce();
    });

    it('does NOT call onRefresh when pull is below threshold', async () => {
      const onRefresh = vi.fn(async () => {});
      renderHook(() => usePullToRefresh({ onRefresh, threshold: 80 }));

      // Pull only 50px (dampened 20px — well below threshold)
      await act(async () => { simulatePull(0, 50); });

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('uses a default threshold of 80', async () => {
      const onRefresh = vi.fn(async () => {});
      renderHook(() => usePullToRefresh({ onRefresh })); // no threshold arg

      await act(async () => { simulatePull(0, 220); });

      expect(onRefresh).toHaveBeenCalledOnce();
    });
  });

  describe('disabled flag', () => {
    it('does NOT call onRefresh when disabled', async () => {
      const onRefresh = vi.fn(async () => {});
      renderHook(() => usePullToRefresh({ onRefresh, disabled: true }));

      await act(async () => { simulatePull(0, 220); });

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it('does NOT update pullDistance when disabled', () => {
      const onRefresh = vi.fn(async () => {});
      const { result } = renderHook(() => usePullToRefresh({ onRefresh, disabled: true }));

      act(() => {
        touch('touchstart', 0);
        touch('touchmove', 200);
      });

      expect(result.current.pullDistance).toBe(0);
    });
  });

  describe('scroll position guard', () => {
    it('does NOT trigger when page is NOT scrolled to top', async () => {
      Object.defineProperty(window, 'scrollY', { value: 50, writable: true, configurable: true });
      const onRefresh = vi.fn(async () => {});
      renderHook(() => usePullToRefresh({ onRefresh }));

      await act(async () => { simulatePull(0, 220); });

      expect(onRefresh).not.toHaveBeenCalled();
    });
  });

  describe('pullDistance state', () => {
    it('increases pullDistance as the user pulls down', () => {
      const onRefresh = vi.fn(async () => {});
      const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

      act(() => {
        touch('touchstart', 0);
        touch('touchmove', 100); // dampened to 40
      });

      expect(result.current.pullDistance).toBeGreaterThan(0);
    });

    it('resets pullDistance to 0 after touchend', async () => {
      const onRefresh = vi.fn(async () => {});
      const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

      await act(async () => { simulatePull(0, 50); });

      expect(result.current.pullDistance).toBe(0);
    });

    it('does NOT increase pullDistance when pulling upward', () => {
      const onRefresh = vi.fn(async () => {});
      const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

      act(() => {
        touch('touchstart', 100);
        touch('touchmove', 50); // negative delta — scrolling up
      });

      expect(result.current.pullDistance).toBe(0);
    });
  });

  describe('isRefreshing state', () => {
    it('sets isRefreshing to true while onRefresh is in-flight', async () => {
      let resolveRefresh!: () => void;
      const onRefresh = vi.fn(() => new Promise<void>(r => { resolveRefresh = r; }));
      const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

      act(() => { simulatePull(0, 220); });
      // onRefresh is now in-flight
      expect(result.current.isRefreshing).toBe(true);

      await act(async () => { resolveRefresh(); });
      expect(result.current.isRefreshing).toBe(false);
    });

    it('resets isRefreshing to false even if onRefresh throws', async () => {
      const onRefresh = vi.fn(async () => { throw new Error('network error'); });
      const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

      await act(async () => { simulatePull(0, 220); });

      expect(result.current.isRefreshing).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes event listeners on unmount', async () => {
      const removeEventListener = vi.spyOn(window, 'removeEventListener');
      const onRefresh = vi.fn(async () => {});
      const { unmount } = renderHook(() => usePullToRefresh({ onRefresh }));

      unmount();

      expect(removeEventListener).toHaveBeenCalledWith('touchstart', expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function));
      expect(removeEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
    });
  });
});
