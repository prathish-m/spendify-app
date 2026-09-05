import { useRef, useState, type ReactNode } from 'react'
import { Loader2, ArrowDown } from 'lucide-react'

/**
 * Lightweight pull-to-refresh for the Android WebView. When the page is
 * scrolled to the very top and the user drags down past a threshold, we call
 * `onRefresh()` (the store's `load()`), showing a spinner meanwhile.
 *
 * Pure touch handling — no extra dependency. Only engages when the drag starts
 * at the top of the scroll, so normal scrolling is never blocked.
 */
const THRESHOLD = 70 // px pulled before a refresh fires
const MAX_PULL = 110 // clamp so the indicator doesn't slide too far

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void
  children: ReactNode
}) {
  const startY = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const atTop = () =>
    (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0

  // True while any modal/dialog overlay is open. Every overlay in the app
  // (Modal, FullScreenSheet, ConfirmDialog) renders with aria-modal="true", so
  // this reliably detects them. We suppress pull-to-refresh in that case: a
  // downward swipe inside (or behind) an open modal must NOT trigger a reload.
  const modalOpen = () =>
    document.querySelector('[aria-modal="true"]') !== null

  const onTouchStart = (e: React.TouchEvent) => {
    if (refreshing || modalOpen()) {
      startY.current = null
      return
    }
    startY.current = atTop() ? e.touches[0].clientY : null
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null || refreshing || modalOpen()) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0) {
      setPull(0)
      return
    }
    // Resistance: ease the pull so it feels rubbery, and clamp the max.
    setPull(Math.min(MAX_PULL, dy * 0.5))
  }

  const onTouchEnd = async () => {
    if (startY.current == null || refreshing) {
      startY.current = null
      setPull(0)
      return
    }
    startY.current = null
    if (pull >= THRESHOLD) {
      setRefreshing(true)
      setPull(THRESHOLD)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  const ready = pull >= THRESHOLD

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden text-slate-400"
        style={{
          height: refreshing ? THRESHOLD : pull,
          transition: startY.current == null ? 'height 0.2s ease' : 'none',
        }}
      >
        {refreshing ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          pull > 0 && (
            <ArrowDown
              size={18}
              className="transition-transform"
              style={{ transform: ready ? 'rotate(180deg)' : 'none' }}
            />
          )
        )}
      </div>
      {children}
    </div>
  )
}
