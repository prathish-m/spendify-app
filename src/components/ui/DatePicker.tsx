import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { formatDate } from '../../lib/format'

/**
 * A compact, themed date picker that replaces the browser's native
 * `type="date"` control. Renders a button showing the selected date and opens
 * a calendar popover with month navigation. Values are ISO `YYYY-MM-DD`
 * strings (local), matching the rest of the app.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Parse an ISO date into a local Date at midnight (safe for the grid). */
function parseISO(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

/** Format a Date back to a local ISO `YYYY-MM-DD` string. */
function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Pick a date',
  ariaLabel,
  fullWidth = false,
  align = 'left',
}: {
  value: string
  onChange: (iso: string) => void
  min?: string
  max?: string
  placeholder?: string
  ariaLabel?: string
  fullWidth?: boolean
  /**
   * Which edge the calendar popover anchors to. Use `right` for controls near
   * the right side of the screen (e.g. a range's end date) so the popover
   * opens leftwards and never pushes the page wider than the viewport.
   */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  // Which sub-view the popover shows: the day grid or a year picker.
  const [mode, setMode] = useState<'days' | 'years'>('days')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => parseISO(value), [value])
  const minDate = useMemo(() => parseISO(min ?? ''), [min])
  const maxDate = useMemo(() => parseISO(max ?? ''), [max])

  // Which month the calendar is showing (defaults to the selected/current one).
  const [view, setView] = useState(() => selected ?? new Date())

  // Re-sync the visible month (and reset to the day view) whenever the
  // popover opens on a new value.
  useEffect(() => {
    if (open) {
      setView(selected ?? new Date())
      setMode('days')
    }
  }, [open, selected])

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

  const isDisabled = (d: Date) => {
    if (minDate && d < minDate) return true
    if (maxDate && d > maxDate) return true
    return false
  }

  // Build the grid (leading blanks for the first weekday offset).
  const cells = useMemo(() => {
    const year = view.getFullYear()
    const month = view.getMonth()
    const firstDow = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const out: (Date | null)[] = []
    for (let i = 0; i < firstDow; i++) out.push(null)
    for (let day = 1; day <= daysInMonth; day++) out.push(new Date(year, month, day))
    return out
  }, [view])

  const today = new Date()

  // Year list for the year-picker view: a window around the current view year,
  // clamped to any min/max bounds so out-of-range years aren't offered.
  const years = useMemo(() => {
    const current = view.getFullYear()
    const lo = minDate ? minDate.getFullYear() : current - 100
    const hi = maxDate ? maxDate.getFullYear() : current + 10
    const out: number[] = []
    for (let y = hi; y >= lo; y--) out.push(y)
    return out
  }, [view, minDate, maxDate])

  return (
    <div ref={rootRef} className={`relative ${fullWidth ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-300 ${
          fullWidth ? 'w-full' : ''
        }`}
      >
        <CalendarIcon size={14} className="shrink-0 text-slate-400" />
        <span className={selected ? '' : 'text-slate-400'}>
          {selected ? formatDate(value) : placeholder}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          className={`absolute top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Month navigation */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
              className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:invisible"
              disabled={mode === 'years'}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setMode((m) => (m === 'years' ? 'days' : 'years'))}
              aria-label="Choose year"
              className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
            >
              {mode === 'years'
                ? 'Select year'
                : `${MONTHS[view.getMonth()]} ${view.getFullYear()}`}
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
              className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:invisible"
              disabled={mode === 'years'}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {mode === 'years' ? (
            /* Year picker */
            <div className="grid max-h-48 grid-cols-3 gap-1 overflow-y-auto">
              {years.map((y) => {
                const isCurrent = y === view.getFullYear()
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setView((v) => new Date(y, v.getMonth(), 1))
                      setMode('days')
                    }}
                    className={`rounded-lg py-1.5 text-xs transition-colors ${
                      isCurrent
                        ? 'bg-slate-900 font-semibold text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {y}
                  </button>
                )
              })}
            </div>
          ) : (
          <>


          {/* Weekday header */}
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase text-slate-400">
            {WEEKDAYS.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />
              const disabled = isDisabled(d)
              const isSelected = selected && sameDay(d, selected)
              const isToday = sameDay(d, today)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(toISO(d))
                    setOpen(false)
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors ${
                    isSelected
                      ? 'bg-slate-900 font-semibold text-white'
                      : disabled
                        ? 'cursor-not-allowed text-slate-300'
                        : isToday
                          ? 'font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100'
                          : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* Quick jump to today (hidden when today is out of range). */}
          {!isDisabled(today) && (
            <div className="mt-2 border-t border-slate-100 pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  onChange(toISO(today))
                  setOpen(false)
                }}
                className="rounded-lg px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                Today
              </button>
            </div>
          )}
          </>
          )}
        </div>
      )}
    </div>
  )
}
