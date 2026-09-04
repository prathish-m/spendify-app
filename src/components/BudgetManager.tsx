import { useMemo, useState } from 'react'
import { Plus, Trash2, Wallet, X, PlusCircle, Pencil } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ApiError, type NewBudget } from '../lib/api'
import { CATEGORIES, type Budget } from '../types'
import { formatMoney, formatDate } from '../lib/format'
import { currentMonthRange, computeBudgetProgress } from '../lib/analytics'
import { DatePicker } from './ui/DatePicker'
import { useConfirm } from './ui/ConfirmDialog'
import { FullScreenSheet } from './ui/FullScreenSheet'

/** A single editable per-category limit row in the create/edit form. */
interface DraftLimit {
  key: number
  category: string
  amount: string
}

/**
 * Budgets screen (Android-only): create/EDIT a spending budget over a date
 * range (defaulting to the current month) with an overall cap and optional
 * per-category limits; list existing budgets with live progress or, once the
 * range has elapsed, a completed summary (saved / overspent). Overlapping
 * ranges are rejected by the server and surfaced inline. Past budgets are
 * capped to the latest few with a full-screen "See more" view.
 */
export function BudgetManager() {
  const budgets = useStore((s) => s.budgets)
  const transactions = useStore((s) => s.transactions)
  const addBudget = useStore((s) => s.addBudget)
  const updateBudget = useStore((s) => s.updateBudget)
  const removeBudget = useStore((s) => s.removeBudget)
  const confirm = useConfirm()

  const defaults = useMemo(() => currentMonthRange(), [])
  const [from, setFrom] = useState(defaults.start)
  const [to, setTo] = useState(defaults.end)
  const [amount, setAmount] = useState('')
  const [limits, setLimits] = useState<DraftLimit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // When set, the form is editing this existing budget instead of creating.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Full-screen "see all past budgets" sheet.
  const [showAllPast, setShowAllPast] = useState(false)

  const nextKey = useMemo(() => {
    let k = 1
    return () => k++
  }, [])

  const addLimitRow = () =>
    setLimits((prev) => [
      ...prev,
      { key: nextKey(), category: CATEGORIES[0], amount: '' },
    ])

  const updateLimitRow = (key: number, patch: Partial<DraftLimit>) =>
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
    setEditingId(null)
  }

  // Load an existing budget into the form for editing.
  const startEdit = (b: Budget) => {
    setEditingId(b.id)
    setFrom(b.startDate)
    setTo(b.endDate)
    setAmount(String(b.amount))
    setLimits(
      b.categoryLimits.map((l) => ({
        key: nextKey(),
        category: l.category,
        amount: String(l.amount),
      })),
    )
    setError(null)
    // Scroll to top so the form is visible.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async () => {
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
    const payload: NewBudget = {
      startDate: from,
      endDate: to,
      amount: amt,
      categoryLimits: [...merged.entries()].map(([category, a]) => ({
        category,
        amount: a,
      })),
    }

    setSaving(true)
    try {
      if (editingId) await updateBudget(editingId, payload)
      else await addBudget(payload)
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
    if (ok) {
      if (editingId === id) reset()
      await removeBudget(id)
    }
  }

  // Split into current/upcoming vs. completed (elapsed) budgets, newest first.
  const today = new Date().toISOString().slice(0, 10)
  const sorted = useMemo(
    () => [...budgets].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [budgets],
  )
  const activeOrUpcoming = sorted.filter((b) => b.endDate >= today)
  const past = sorted.filter((b) => b.endDate < today)
  const pastPreview = past.slice(0, 5)

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">
          Budgets
        </h2>
      </div>

      {/* Create / edit form */}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div className="flex items-center justify-between">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
            {editingId ? 'Edit budget' : 'New budget'}
          </span>
          {editingId && (
            <button
              type="button"
              onClick={reset}
              className="rounded-full px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              Cancel edit
            </button>
          )}
        </div>

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
                onChange={(e) => updateLimitRow(l.key, { category: e.target.value })}
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
                onChange={(e) => updateLimitRow(l.key, { amount: e.target.value })}
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
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus size={15} />{' '}
          {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create budget'}
        </button>
      </div>

      {/* Current & upcoming budgets */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-xs text-slate-400 shadow-sm ring-1 ring-slate-100">
          No budgets yet. Create one above to track your spending.
        </div>
      ) : (
        <>
          {activeOrUpcoming.length > 0 && (
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Current & upcoming
              </span>
              {activeOrUpcoming.map((b) => (
                <BudgetCard
                  key={b.id}
                  budget={b}
                  transactions={transactions}
                  onEdit={() => startEdit(b)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Completed
                </span>
                {past.length > pastPreview.length && (
                  <button
                    type="button"
                    onClick={() => setShowAllPast(true)}
                    className="rounded-full px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  >
                    See more ({past.length})
                  </button>
                )}
              </div>
              {pastPreview.map((b) => (
                <BudgetCard
                  key={b.id}
                  budget={b}
                  transactions={transactions}
                  onEdit={() => startEdit(b)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Full-screen: all past budgets */}
      <FullScreenSheet
        open={showAllPast}
        onClose={() => setShowAllPast(false)}
        title="Completed budgets"
      >
        <div className="space-y-2">
          {past.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              transactions={transactions}
              onEdit={() => {
                setShowAllPast(false)
                startEdit(b)
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </FullScreenSheet>
    </section>
  )
}

/**
 * A single budget card. Live budgets show a spent-vs-cap progress bar; once the
 * range has elapsed it shows a completed summary — how much was saved or
 * overspent overall, and how many category limits were kept vs exceeded.
 */
function BudgetCard({
  budget,
  transactions,
  onEdit,
  onDelete,
}: {
  budget: Budget
  transactions: import('../types').Transaction[]
  onEdit: () => void
  onDelete: (id: string, label: string) => void
}) {
  const p = useMemo(
    () => computeBudgetProgress(transactions, budget),
    [transactions, budget],
  )
  const label = `${formatDate(budget.startDate)} – ${formatDate(budget.endDate)}`
  const pct = p.limit > 0 ? Math.min(100, (p.spent / p.limit) * 100) : 0

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {formatMoney(p.spent)}{' '}
            <span className="text-xs font-normal text-slate-400">
              / {formatMoney(p.limit)}
            </span>
          </p>
          <p className="truncate text-xs text-slate-400">{label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Edit budget"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(budget.id, label)}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-money-out"
            aria-label="Delete budget"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${p.over ? 'bg-money-out' : 'bg-money-in'}`}
          style={{ width: `${p.over ? 100 : pct}%` }}
        />
      </div>

      {p.completed ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span
            className={`font-semibold ${p.over ? 'text-money-out' : 'text-money-in'}`}
          >
            {p.over
              ? `Overspent ${formatMoney(Math.abs(p.remaining))}`
              : `Saved ${formatMoney(p.remaining)}`}
          </span>
          {p.categoryLimitsTotal > 0 && (
            <span className="text-slate-400">
              {p.categoryLimitsWithin} of {p.categoryLimitsTotal} within limit
              {p.categoryLimitsOver > 0 ? ` · ${p.categoryLimitsOver} over` : ''}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs">
          <span
            className={`font-semibold ${p.over ? 'text-money-out' : 'text-money-in'}`}
          >
            {p.over
              ? `${formatMoney(Math.abs(p.remaining))} over`
              : `${formatMoney(p.remaining)} left`}
          </span>
          {budget.categoryLimits.length > 0 && (
            <span className="text-slate-400">
              {budget.categoryLimits.length} category limit
              {budget.categoryLimits.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

