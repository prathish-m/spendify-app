import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useStore } from '../../store/useStore'

/**
 * Global BLOCKING activity indicator for in-flight mutating actions.
 *
 * Whenever `busy > 0` (any add/remove/adjust/link request is running) this
 * renders a full-screen overlay that:
 *   1. Captures every pointer/keyboard interaction, so a second click can't
 *      reach any button underneath — this prevents accidental double-submits
 *      (e.g. adding the same transaction twice).
 *   2. Shows a slim indeterminate bar at the top plus a centered "Saving…"
 *      card, so the user clearly sees the action is being processed.
 *
 * This is deliberately separate from the store's `loading` flag — that one
 * gates the full-page initial data fetch. Here we keep the current UI visible
 * (dimmed) behind the overlay and just block input until the server responds.
 *
 * To avoid a flicker on very fast requests we only reveal the overlay after a
 * short delay, and once shown we keep it up for a brief minimum so it never
 * flashes. During the pre-reveal delay the overlay is still mounted (invisible)
 * so clicks are blocked immediately — the visual is delayed, the guard is not.
 */
const SHOW_DELAY_MS = 120 // wait this long before showing the visual (skip instant ops)
const MIN_VISIBLE_MS = 400 // once the visual shows, keep it up at least this long

export function GlobalBusy() {
  const busy = useStore((s) => s.busy)
  // `blocking` guards input the instant an action starts; `visible` controls
  // the (slightly delayed, min-duration) visual so it doesn't flash.
  const [visible, setVisible] = useState(false)
  const shownAt = useRef(0)
  const showTimer = useRef<ReturnType<typeof setTimeout>>()
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()

  const blocking = busy > 0

  useEffect(() => {
    clearTimeout(showTimer.current)
    clearTimeout(hideTimer.current)

    if (blocking) {
      // Delay the visible spinner so quick requests don't flash it.
      showTimer.current = setTimeout(() => {
        shownAt.current = Date.now()
        setVisible(true)
      }, SHOW_DELAY_MS)
    } else if (visible) {
      // Keep the visual up for a minimum time to avoid a jarring flash-off.
      const elapsed = Date.now() - shownAt.current
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)
      hideTimer.current = setTimeout(() => setVisible(false), remaining)
    }

    return () => {
      clearTimeout(showTimer.current)
      clearTimeout(hideTimer.current)
    }
  }, [blocking, visible])

  // Nothing running and nothing lingering → render nothing (no click guard).
  if (!blocking && !visible) return null

  return (
    <>
      {/* Slim indeterminate progress bar across the top of the viewport. */}
      {visible && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-slate-900/10"
          role="progressbar"
          aria-label="Working"
        >
          <div className="busy-bar h-full w-2/5 bg-slate-900" />
        </div>
      )}

      {/*
        Full-screen input guard. Always present while an action runs (even
        during the pre-reveal delay) so a second click is swallowed here rather
        than hitting a button. It only *dims* once `visible` is true, keeping
        the guard invisible for sub-120ms operations.
      */}
      <div
        className={`fixed inset-0 z-[65] flex items-center justify-center transition-colors duration-150 ${
          visible ? 'bg-slate-900/20 backdrop-blur-[1px]' : 'bg-transparent'
        }`}
        // Swallow every interaction so nothing underneath can be triggered.
        onClickCapture={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onKeyDownCapture={(e) => e.preventDefault()}
        role="alertdialog"
        aria-busy="true"
        aria-live="polite"
        aria-label="Saving, please wait"
      >
        {visible && (
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-xl ring-1 ring-slate-100">
            <Loader2 size={18} className="animate-spin text-slate-900" />
            <span>Saving…</span>
          </div>
        )}
      </div>
    </>
  )
}

