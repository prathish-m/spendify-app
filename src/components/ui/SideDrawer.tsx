import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface SideDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * A left-anchored slide-out drawer (Android app menu).
 *
 * Slides in from the left (`-100% → 0`) over a dimmed backdrop. Closes on
 * backdrop tap or Escape. The panel is always mounted so the slide transition
 * plays both ways; pointer events are disabled while closed so it never blocks
 * the UI. A glassy dark surface keeps it consistent with the app theme.
 */
export function SideDrawer({ open, onClose, title, children }: SideDrawerProps) {
  // Close on Escape and lock background scroll while open.
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
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header className="flex items-center justify-between px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </header>
        <nav className="flex flex-col gap-1 px-3 pb-6">{children}</nav>
      </aside>
    </div>
  )
}

interface DrawerItemProps {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}

/**
 * A full-width row inside the drawer: leading icon + label. Styled to match the
 * app's neutral controls, with an optional destructive (red) variant.
 */
export function DrawerItem({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}: DrawerItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors disabled:opacity-40 ${
        destructive
          ? 'text-slate-600 hover:bg-red-50 hover:text-money-out disabled:hover:bg-transparent'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:hover:bg-transparent'
      }`}
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
