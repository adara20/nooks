import { useState, useEffect, useRef, useCallback } from 'react';

interface UsePullToRefreshOptions {
  /** Async function to call when the pull threshold is met. */
  onRefresh: () => Promise<void>;
  /**
   * Pull distance in pixels required to trigger a refresh.
   * The visual indicator uses a ~0.4× damping factor, so the user's
   * finger travels ~2.5× this value before triggering.
   * @default 80
   */
  threshold?: number;
  /**
   * When true the hook registers no event listeners.
   * Use this to disable pull-to-refresh on views where it is not relevant
   * (e.g. the normal task list, which is already live via useLiveQuery).
   */
  disabled?: boolean;
}

interface UsePullToRefreshResult {
  /** Dampened pull distance exposed to the indicator component. */
  pullDistance: number;
  /** True while onRefresh is in-flight. */
  isRefreshing: boolean;
}

/**
 * Adds a mobile pull-to-refresh gesture to the window.
 *
 * Listens to window-level touch events and calls `onRefresh` when the user
 * pulls down past `threshold` while the page is scrolled to the top.
 *
 * All three Firestore-backed views (HomeView, TasksView inbox, ContributorHomeView)
 * use window scrolling, so this hook attaches to `window` rather than a specific div.
 *
 * Implementation notes:
 * - A ref mirrors `pullDistance` to avoid a stale closure in the touchend handler.
 * - `onRefresh` is stored in a ref so the useEffect only registers once, but
 *   always invokes the latest version of the callback.
 * - All listeners are passive to keep scroll performance unaffected.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Ref mirror of pullDistance — avoids stale closure in touchend handler
  const pullDistanceRef = useRef(0);
  // Ref for the touch start Y coordinate
  const touchStartY = useRef(0);
  // Whether a pull gesture is currently in progress
  const isPulling = useRef(false);
  // Always-current version of the onRefresh callback
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const reset = useCallback(() => {
    pullDistanceRef.current = 0;
    setPullDistance(0);
    isPulling.current = false;
  }, []);

  useEffect(() => {
    if (disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only begin tracking if we're at the very top of the page
      if (window.scrollY > 0) return;
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current) return;
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta <= 0) {
        // Scrolling up — cancel the pull gesture
        reset();
        return;
      }
      // Dampen the raw delta so the indicator moves at ~40% of finger speed,
      // capping slightly above threshold to give clear visual confirmation.
      const dampened = Math.min(delta * 0.4, threshold * 1.2);
      pullDistanceRef.current = dampened;
      setPullDistance(dampened);
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current) return;
      const distance = pullDistanceRef.current;
      reset();

      if (distance >= threshold) {
        setIsRefreshing(true);
        try {
          await onRefreshRef.current();
        } catch {
          // Silently swallow — the refresh failed (e.g. network error).
          // The UI shows stale data; the user can pull again.
        } finally {
          setIsRefreshing(false);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disabled, threshold, reset]);

  return { pullDistance, isRefreshing };
}
