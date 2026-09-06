import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

/**
 * A compact, themed single-select dropdown that replaces the browser's native
 * `<select>` control (which renders as jarring native Android UI inside the
 * WebView). Renders a button showing the current selection and opens a themed
 * popover list. Closes on outside-click / Escape, matching the DatePicker.
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
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-900 focus:outline-none ${buttonClassName}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
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
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-slate-900 font-medium text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {isSelected && <Check size={14} className="shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
