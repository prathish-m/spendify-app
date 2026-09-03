import type { ReactNode } from 'react'

/**
 * Borderless form field wrapper: a small uppercase label sitting above a
 * borderless input, separated from siblings by a subtle divider. This keeps
 * forms feeling light and uncluttered per the minimalist design system.
 */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="border-b border-slate-100 py-3">
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

/** Shared class list for borderless inputs used across forms. */
export const inputClass =
  'w-full border-0 bg-transparent p-0 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0'
