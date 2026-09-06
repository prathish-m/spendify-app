import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

/**
 * A compact, themed single-select dropdown that replaces the browser's native
 * `<select>` control (which renders as jarring native Android UI inside the
 * WebView).
 *
 * The options list is rendered through a portal to `document.body` with fixed
 * positioning, anchored to the trigger button. This is essential because the
 * control lives inside modals whose bodies use `overflow-y-auto` — an in-flow
 * absolute list would be clipped/hidden by that container. The list flips above
 * the button when there isn't room below, and closes on outside-click, Escape,
 * or scroll.
 */
export interface SelectOption {
  value: string
  label: string
}

interface Rect {
  left: number
  top: number
  width: number
  /** True when the list is anchored ABOVE the button (opens upward). */
  above: boolean
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
  const [rect, setRect] = useState<Rect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  /** Fixed-position style for the portalled list, based on the measured rect. */
  const listStyle: CSSProperties = rect
    ? {
        left: rect.left,
        width: rect.width,
        ...(rect.above
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.top + 4 }),
      }
    : {}

  /** Measure the trigger and decide whether to open below or above it. */
  const measure = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Rough list height estimate (capped at max-h-56 = 14rem = 224px).
    const estimated = Math.min(224, options.length * 40 + 8)
    const spaceBelow = window.innerHeight - r.bottom
    const above = spaceBelow < estimated + 8 && r.top > spaceBelow
    setRect({
      left: r.left,
      top: above ? r.top : r.bottom,
      width: r.width,
      above,
    })
  }

  // Measure synchronously right before paint when opening (avoids a flash at
  // the wrong position).
  useLayoutEffect(() => {
    if (open) measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click / Escape / scroll (scroll-close keeps the anchored
  // position honest without jitter on Android).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        btnRef.current && !btnRef.current.contains(t) &&
        listRef.current && !listRef.current.contains(t)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Capture phase so we catch scrolls on any ancestor scroll container.
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
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

      {open && rect &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            className="fixed z-[60] max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            style={listStyle}
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
          </div>,
          document.body,
        )}
    </div>
  )
}
