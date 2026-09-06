import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

/**
 * A compact, themed single-select control that replaces the browser's native
 * `<select>` (which renders as jarring native Android UI inside the WebView).
 *
 * Instead of an anchored dropdown popover, the options open in a dedicated
 * **centered picker modal** portalled to `document.body`. This is the most
 * robust approach for this app because the control lives inside other modals
 * whose bodies use `overflow-y-auto`: an anchored popover was being clipped by
 * that container and dismissed by scroll events on Android. A separate centered
 * modal has no positioning/clipping/scroll concerns at all — it simply overlays
 * everything (z-index above the parent modal) and closes on pick / backdrop /
 * Escape.
 */
export interface SelectOption {
  value: string
  label: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  ariaLabel,
  className = '',
  buttonClassName = '',
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  ariaLabel?: string
  /** Extra classes for the outer wrapper (e.g. flex sizing). */
  className?: string
  /** Extra classes for the trigger button (e.g. background / ring styling). */
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  // Close on Escape while the picker is open. Background scroll is intentionally
  // NOT locked here: the parent Modal already locks it, and toggling it again
  // on unmount could unlock while the parent is still open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className={className}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-900 focus:outline-none ${buttonClassName}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} className="shrink-0 text-slate-400" />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
          >
            {/* Backdrop — sits above the parent modal's own backdrop. */}
            <div
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            />

            {/* Centered panel */}
            <div className="relative z-10 flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
              {ariaLabel && (
                <header className="px-5 pt-5 pb-2">
                  <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                    {ariaLabel}
                  </h3>
                </header>
              )}
              <div
                role="listbox"
                className="overflow-y-auto px-3 pb-4 pt-1"
              >
                {options.map((o) => {
                  const isSelected = o.value === value
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(o.value)
                        setOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-slate-900 font-medium text-white'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {isSelected && <Check size={16} className="shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

