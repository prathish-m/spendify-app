import { useMemo, useState } from 'react'
import { Plus, Trash2, Wallet, X, PlusCircle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ApiError } from '../lib/api'
import { CATEGORIES } from '../types'
import { formatMoney, formatDate } from '../lib/format'
import { currentMonthRange } from '../lib/analytics'
import { DatePicker } from './ui/DatePicker'
import { useConfirm } from './ui/ConfirmDialog'

/** A single editable per-category limit row in the create form. */
interface DraftLimit {
  key: number
  category: string
  amount: string
}

/**
 * Budgets screen (Android-only): create a spending budget over a date range
 * (defaulting to the current month) with an overall cap and optional
 * per-category limits, list existing budgets, and delete them. Overlapping
 * ranges are rejected by the server and surfaced inline.
 */
export function BudgetManager() {
  const budgets = useStore((s) => s.budgets)
  const addBudget = useStore((s) => s.addBudget)
  const removeBudget = useStore((s) => s.removeBudget)
  const confirm = useConfirm()

  const defaults = useMemo(() => currentMonthRange(), [])
  const [from, setFrom] = useState(defaults.start)
  const [to, setTo] = useState(defaults.end)
  const [amount, setAmount] = useState('')
  const [limits, setLimits] = useState<DraftLimit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const nextKey = useMemo(() => {
    let k = 1
    return () => k++
  }, [])

  const addLimitRow = () =>
    setLimits((prev) => [
      ...prev,
      { key: nextKey(), category: CATEGORIES[0], amount: '' },
    ])

  const updateLimit = (key: number, patch: Partial<DraftLimit>) =>
    setLimits((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    )

  const removeLimit = (key: number) =>
    setLimits((prev) => prev.filter((l) => l.key !== key))

  const reset = () => {
    const d = currentMonthRange()
    setFrom(d.start)
    setTo(d.end)
    setAmount('')
    setLimits([])
    setError(null)
  }

  const handleCreate = async () => {
    setError(null)
    const amt = Number(amount)
    if (!from || !to) {
      setError('Pick a start and end date.')
      return
    }
    if (to < from) {
      setError('End date must not be before the start date.')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a budget amount greater than zero.')
      return
    }

    // Collapse per-category limits, summing duplicates, dropping blanks.
    const merged = new Map<string, number>()
    for (const l of limits) {
      const cat = l.category.trim()
      const n = Number(l.amount)
      if (!cat || !Number.isFinite(n) || n <= 0) continue
      merged.set(cat, (merged.get(cat) ?? 0) + n)
    }
    const categoryLimits = [...merged.entries()].map(([category, a]) => ({
      category,
      amount: a,
    }))

    setSaving(true)
    try {
      await addBudget({ startDate: from, endDate: to, amount: amt, categoryLimits })
      reset()
    } catch (err) {
      // Overlap (409) or validation error → show inline, don't nuke the form.
      if (err instanceof ApiError) setError(err.message)
      else setError(err instanceof Error ? err.message : 'Could not save budget.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Delete this budget?',
      message: `Remove the budget for ${label}? This only deletes the budget, not your transactions.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) await removeBudget(id)
  }

  // Sorted newest range first (server already orders, but be defensive).
  const sorted = useMemo(
    () => [...budgets].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [budgets],
  )

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">
          Budgets
        </h2>
      </div>

      {/* Create form */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          New budget
        </span>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-medium uppercase tracking-wider text-slate-400">
            Range
          </span>
          <DatePicker
            value={from}
            max={to || undefined}
            onChange={setFrom}
            placeholder="From"
            ariaLabel="Budget start date"
          />
          <span className="text-slate-300">→</span>
          <DatePicker
            value={to}
            min={from || undefined}
            onChange={setTo}
            placeholder="To"
            ariaLabel="Budget end date"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Overall amount
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 20000"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {/* Optional per-category limits */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Category limits (optional)
            </span>
            <button
              type="button"
              onClick={addLimitRow}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <PlusCircle size={13} /> Add
            </button>
          </div>

          {limits.map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <select
                value={l.category}
                onChange={(e) => updateLimit(l.key, { category: e.target.value })}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={l.amount}
                onChange={(e) => updateLimit(l.key, { amount: e.target.value })}
                placeholder="Limit"
                className="w-24 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => removeLimit(l.key)}
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-money-out"
                aria-label="Remove limit"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="rounded-lg bg-money-out/10 px-3 py-2 text-xs font-medium text-money-out">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus size={15} /> {saving ? 'Saving…' : 'Create budget'}
        </button>
      </div>

      {/* Existing budgets */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-xs text-slate-400 shadow-sm ring-1 ring-slate-100">
          No budgets yet. Create one above to track your spending.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((b) => {
            const label = `${formatDate(b.startDate)} – ${formatDate(b.endDate)}`
            return (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {formatMoney(b.amount)}
                  </p>
                  <p className="truncate text-xs text-slate-400">{label}</p>
                  {b.categoryLimits.length > 0 && (
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      {b.categoryLimits.length} category limit
                      {b.categoryLimits.length === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id, label)}
                  className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-money-out"
                  aria-label="Delete budget"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
