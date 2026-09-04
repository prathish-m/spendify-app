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
 * A centered modal used for "See more" / details views (full history / all
 * budgets / budget details). Animated with framer-motion: a fading backdrop
 * plus a panel that scales in from the middle of the screen (no bottom slide).
 * Locks background scroll and closes on Escape / backdrop tap. Dark-theme aware
 * (its `bg-white` surface is remapped in dark mode) and respects the Android
 * safe-area insets.
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
    // Lock BOTH <body> and <html>: on Android WebView the scrolling container
    // is often the documentElement, so locking body alone lets the page behind
    // the sheet still scroll.
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          {/* Panel — centered modal that scales in from the middle */}
          <motion.div
            className="relative z-10 flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.7 }}
          >
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
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
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
