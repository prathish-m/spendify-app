import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Animated wrapper for the main page area. Each time `pageKey` changes, the old
 * page fades/slides out while the new one slides in from the side. `direction`
 * (+1 forward / -1 back) controls the slide axis so moving to a later tab
 * slides left→right vs. the reverse, which reads as native.
 *
 * Uses a spring transition and respects the user's reduced-motion preference
 * automatically (framer-motion honors `prefers-reduced-motion`).
 */
export function PageTransition({
  pageKey,
  direction,
  children,
}: {
  pageKey: string
  direction: number
  children: ReactNode
}) {
  const distance = 24 * (direction >= 0 ? 1 : -1)
  return (
    // A stable min-height keeps the content area from collapsing to zero during
    // the exit→enter gap (mode="wait"), which would otherwise toggle the page's
    // vertical scrollbar and make the fixed bottom nav visibly jump.
    <div className="min-h-[70vh]">
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        initial={{ opacity: 0, x: distance }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -distance }}
        transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
    </div>
  )
}
