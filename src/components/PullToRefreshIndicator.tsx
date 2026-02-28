import React from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  /** Dampened pull distance from usePullToRefresh (0 when idle). */
  pullDistance: number;
  /** True while the refresh callback is in-flight. */
  isRefreshing: boolean;
  /** Must match the threshold passed to usePullToRefresh (default 80). */
  threshold?: number;
}

/**
 * Fixed-position pill indicator that slides down from the top of the viewport
 * as the user pulls.  Becomes a spinner while the refresh is in-flight.
 *
 * Positioning logic:
 * - At pullDistance=0 the pill sits at translateY(-56px) — fully off-screen.
 * - As pullDistance increases it slides into view.
 * - While isRefreshing it stays visible at translateY(12px).
 * - A CSS transition on `transform` and `opacity` provides the smooth feel
 *   only during the snap-back (isRefreshing=true) to avoid fighting the user's
 *   finger during the active pull.
 */
export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullDistance,
  isRefreshing,
  threshold = 80,
}) => {
  const isVisible = pullDistance > 0 || isRefreshing;
  if (!isVisible) return null;

  // Slide the pill proportionally to pull distance, clamped at 12px below top
  const translateY = isRefreshing
    ? 12
    : Math.min(pullDistance - 44, 12);

  // Fade in from 0 → 1 between 20px and threshold
  const opacity = isRefreshing
    ? 1
    : Math.min(Math.max((pullDistance - 20) / (threshold - 20), 0), 1);

  // Rotate the icon 0 → 180° as pull approaches threshold (signals "release")
  const iconRotation = isRefreshing
    ? 0
    : Math.min((pullDistance / threshold) * 180, 180);

  return (
    <div
      aria-label={isRefreshing ? 'Refreshing' : 'Pull to refresh'}
      className="fixed top-0 left-1/2 z-50 pointer-events-none flex items-center gap-1.5 bg-white shadow-md rounded-full px-3 py-1.5"
      style={{
        transform: `translateX(-50%) translateY(${translateY}px)`,
        opacity,
        // Only apply a transition during snap-back so the pill doesn't lag behind the finger
        transition: isRefreshing ? 'transform 0.25s ease, opacity 0.25s ease' : 'opacity 0.1s ease',
      }}
    >
      {isRefreshing ? (
        <div
          className="w-4 h-4 rounded-full border-2 border-nook-orange border-t-transparent animate-spin"
          data-testid="ptr-spinner"
        />
      ) : (
        <RefreshCw
          size={14}
          className="text-nook-orange"
          style={{ transform: `rotate(${iconRotation}deg)`, transition: 'transform 0.1s ease' }}
          data-testid="ptr-icon"
        />
      )}
      <span className="text-[11px] font-bold text-nook-ink/50 select-none">
        {pullDistance >= threshold ? 'Release' : 'Refreshing…'}
      </span>
    </div>
  );
};
