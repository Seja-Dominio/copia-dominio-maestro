import { useState, useRef, useCallback } from "react";

export function usePullToRefresh(onRefresh) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(null);
  const containerRef = useRef(null);
  const THRESHOLD = 64;

  const getScrollTop = useCallback(() => {
    if (containerRef.current) return containerRef.current.scrollTop;
    return document.querySelector('[data-main-scroll]')?.scrollTop ?? 0;
  }, []);

  const onTouchStart = useCallback((e) => {
    if (getScrollTop() === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, [getScrollTop]);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null) return;
    const dist = e.touches[0].clientY - startY.current;
    if (dist > 0) {
      setPullDistance(Math.min(dist * 0.5, THRESHOLD));
    }
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (pullDistance >= THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(0);
      startY.current = null;
      try { await onRefresh(); } finally { setIsRefreshing(false); }
    } else {
      setPullDistance(0);
      startY.current = null;
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  const handlers = { onTouchStart, onTouchMove, onTouchEnd };

  const PullIndicator = () => (
    (isRefreshing || pullDistance > 10) ? (
      <div className="flex justify-center py-3 text-muted-foreground"
        style={{ marginTop: isRefreshing ? 0 : `${pullDistance - 40}px`, transition: isRefreshing ? "none" : "margin 0.1s" }}>
        <div className={`w-6 h-6 border-2 border-primary border-t-transparent rounded-full ${isRefreshing ? "animate-spin" : ""}`}
          style={{ transform: isRefreshing ? "" : `rotate(${(pullDistance / THRESHOLD) * 360}deg)` }} />
      </div>
    ) : null
  );

  return { containerRef, handlers, isRefreshing, PullIndicator };
}