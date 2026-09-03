import { create } from 'zustand'
import { AlertTriangle } from 'lucide-react'

/**
 * A tiny global confirmation-dialog service.
 *
 * Usage from anywhere:
 *
 *   const confirm = useConfirm()
 *   if (await confirm({ title: 'Delete this?', confirmLabel: 'Delete' })) {
 *     // proceed
 *   }
 *
 * A single <ConfirmDialog /> is mounted once at the app root; calling
 * `confirm(...)` opens it and resolves the returned promise with the user's
 * choice (true = confirmed, false = cancelled/dismissed).
 */
export interface ConfirmOptions {
  title: string
  /** Optional supporting line shown under the title. */
  message?: string
  /** Confirm button label (default: "Confirm"). */
  confirmLabel?: string
  /** Cancel button label (default: "Cancel"). */
  cancelLabel?: string
  /** When true, the confirm button uses a destructive (red) style. */
  destructive?: boolean
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions | null
  resolve: ((confirmed: boolean) => void) | null
  request: (options: ConfirmOptions) => Promise<boolean>
  close: (confirmed: boolean) => void
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  request: (options) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, options, resolve })
    }),
  close: (confirmed) => {
    get().resolve?.(confirmed)
    set({ open: false, options: null, resolve: null })
  },
}))

/** Returns an async `confirm(options)` function. */
export function useConfirm() {
  return useConfirmStore((s) => s.request)
}

/** Mount once at the app root. */
export function ConfirmDialog() {
  const open = useConfirmStore((s) => s.open)
  const options = useConfirmStore((s) => s.options)
  const close = useConfirmStore((s) => s.close)

  if (!open || !options) return null

  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = true,
  } = options

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
        onClick={() => close(false)}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              destructive
                ? 'bg-money-out/10 text-money-out'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {message && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => close(false)}
            className="rounded-full px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => close(true)}
            className={`rounded-full px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 ${
              destructive ? 'bg-money-out' : 'bg-slate-900'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
