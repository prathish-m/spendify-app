import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

interface FullScreenSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * A full-screen slide-up sheet used for "See more" views (full history / all
 * budgets) that need room for search, filters and a long list. Animated with
 * framer-motion: a fading backdrop plus a panel that slides up from the bottom.
 * Locks background scroll and closes on Escape / backdrop tap. Respects the
 * Android safe-area insets top and bottom.
 */
export function FullScreenSheet({
  open,
  onClose,
  title,
  children,
}: FullScreenSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          {/* Panel — nearly full height, sliding up from the bottom */}
          <motion.div
            className="relative z-10 mt-auto flex h-[94vh] w-full flex-col rounded-t-3xl bg-neutral-50 shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
          >
            <header
              className="flex items-center justify-between border-b border-slate-100 px-5 py-4"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
            >
              <h2 className="text-base font-semibold tracking-tight text-slate-900">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </header>

            <div
              className="flex-1 overflow-y-auto px-5 py-4"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
