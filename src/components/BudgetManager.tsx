import { useMemo, useState } from 'react'
import { Plus, Trash2, Wallet, X, PlusCircle, Pencil } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ApiError, type NewBudget } from '../lib/api'
import { CATEGORIES, type Budget } from '../types'
import { allCategories, getCustomCategories } from '../lib/categories'
import { formatMoney, formatDate } from '../lib/format'
import { currentMonthRange, computeBudgetProgress } from '../lib/analytics'
import { CHART_COLORS as COLORS } from '../lib/colors'
import { DatePicker } from './ui/DatePicker'
import { Select } from './ui/Select'
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
  // Full-screen "see all current/upcoming budgets" sheet.
  const [showAllActive, setShowAllActive] = useState(false)
  // When set, shows the details modal for this budget (category breakdown).
  const [detailsBudget, setDetailsBudget] = useState<Budget | null>(null)

  const nextKey = useMemo(() => {
    let k = 1
    return () => k++
  }, [])

  // Categories offered in the per-category limit picker: the built-in set plus
  // the user's custom categories (same list the transaction form uses), so a
  // budget can cap spending on a custom category too. Read once on mount from
  // localStorage — custom categories are created in the transaction form.
  const categoryOptions = useMemo(
    () => allCategories(getCustomCategories()),
    [],
  )

  // Live allocation summary: how much of the overall budget is assigned to
  // per-category limits, and how much is left unallocated. Blank/invalid limit
  // amounts count as zero. `unallocated` can go negative if the category limits
  // together exceed the overall amount (surfaced in red as "over-allocated").
  const { allocated, unallocated, overAllocated } = useMemo(() => {
    const overall = Number(amount)
    const alloc = limits.reduce((sum, l) => {
      const n = Number(l.amount)
      return Number.isFinite(n) && n > 0 ? sum + n : sum
    }, 0)
    const overallSafe = Number.isFinite(overall) && overall > 0 ? overall : 0
    const remaining = overallSafe - alloc
    return {
      allocated: alloc,
      unallocated: remaining,
      overAllocated: remaining < 0,
    }
  }, [amount, limits])

  const addLimitRow = () =>
    setLimits((prev) => [
      ...prev,
      { key: nextKey(), category: String(categoryOptions[0] ?? CATEGORIES[0]), amount: '' },
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
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a budget amount greater than zero.')
      return
    }
    // The pickers are independent, so the user may have set an end date before
    // the start. Normalize the order rather than forcing them to re-pick.
    const startDate = from <= to ? from : to
    const endDate = from <= to ? to : from

    // Collapse per-category limits, summing duplicates, dropping blanks.
    const merged = new Map<string, number>()
    for (const l of limits) {
      const cat = l.category.trim()
      const n = Number(l.amount)
      if (!cat || !Number.isFinite(n) || n <= 0) continue
      merged.set(cat, (merged.get(cat) ?? 0) + n)
    }
    const payload: NewBudget = {
      startDate,
      endDate,
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
      // Overlap (409) or validation error â†’ show inline, don't nuke the form.
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
  const activePreview = activeOrUpcoming.slice(0, 5)

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
            onChange={setFrom}
            placeholder="From"
            ariaLabel="Budget start date"
          />
          <span className="text-slate-300">→</span>
          <DatePicker
            value={to}
            onChange={setTo}
            placeholder="To"
            ariaLabel="Budget end date"
            align="right"
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
              {/* Built-in + custom categories. If an edited budget's saved
                  limit uses a category no longer in the list, keep it as an
                  option so the select still shows the right value. */}
              <Select
                value={l.category}
                onChange={(v) => updateLimitRow(l.key, { category: v })}
                ariaLabel="Category"
                className="min-w-0 flex-1"
                buttonClassName="rounded-xl border border-slate-200 bg-white focus:border-slate-400"
                options={(categoryOptions.some((c) => c === l.category)
                  ? categoryOptions
                  : [l.category, ...categoryOptions]
                ).map((c) => ({ value: c, label: c }))}
              />
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

          {/* Live allocation summary: shows how much of the overall budget is
              still unassigned as category limits are typed. Turns red when the
              limits together exceed the overall amount. Read-only hint only. */}
          {limits.length > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-500">
                Allocated {formatMoney(allocated)}
              </span>
              <span
                className={
                  overAllocated
                    ? 'font-semibold text-money-out'
                    : 'font-medium text-slate-700'
                }
              >
                {overAllocated
                  ? `Over by ${formatMoney(Math.abs(unallocated))}`
                  : `Unallocated ${formatMoney(unallocated)}`}
              </span>
            </div>
          )}
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
              <div className="flex items-center justify-between">
                <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Current & upcoming
                </span>
                {activeOrUpcoming.length > activePreview.length && (
                  <button
                    type="button"
                    onClick={() => setShowAllActive(true)}
                    className="rounded-full px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  >
                    See more ({activeOrUpcoming.length})
                  </button>
                )}
              </div>
              {activePreview.map((b) => (
                <BudgetCard
                  key={b.id}
                  budget={b}
                  transactions={transactions}
                  onOpen={() => setDetailsBudget(b)}
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
                  onOpen={() => setDetailsBudget(b)}
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
              onOpen={() => setDetailsBudget(b)}
              onEdit={() => {
                setShowAllPast(false)
                startEdit(b)
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </FullScreenSheet>

      {/* Full-screen: all current/upcoming budgets */}
      <FullScreenSheet
        open={showAllActive}
        onClose={() => setShowAllActive(false)}
        title="Current & upcoming budgets"
      >
        <div className="space-y-2">
          {activeOrUpcoming.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              transactions={transactions}
              onOpen={() => setDetailsBudget(b)}
              onEdit={() => {
                setShowAllActive(false)
                startEdit(b)
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </FullScreenSheet>

      {/* Budget details: per-category breakdown */}
      <FullScreenSheet
        open={detailsBudget !== null}
        onClose={() => setDetailsBudget(null)}
        title="Budget details"
      >
        {detailsBudget && (
          <BudgetDetails budget={detailsBudget} transactions={transactions} />
        )}
      </FullScreenSheet>
    </section>
  )
}

/**
 * Read-only details for a single budget shown inside the centered modal: the
 * overall spent-vs-cap headline plus a per-category breakdown (spend and, where
 * set, the category limit and how much is left / over).
 */
function BudgetDetails({
  budget,
  transactions,
}: {
  budget: Budget
  transactions: import('../types').Transaction[]
}) {
  const p = useMemo(
    () => computeBudgetProgress(transactions, budget),
    [transactions, budget],
  )
  const label = `${formatDate(budget.startDate)} — ${formatDate(budget.endDate)}`
  // Assign a stable palette color to each spent category (spend-sorted order),
  // so the segmented overall bar and the per-category rows below share colors.
  const colorByCat = useMemo(() => {
    const m = new Map<string, string>()
    p.categories
      .filter((c) => c.spent > 0)
      .forEach((c, i) => m.set(c.category, COLORS[i % COLORS.length]))
    return m
  }, [p.categories])

  // Overall bar segments: width = category spend as a fraction of the cap,
  // clamped so the running total never exceeds the track.
  const segments = useMemo(() => {
    if (p.limit <= 0)
      return [] as { category: string; width: number; color: string }[]
    let used = 0
    return p.categories
      .filter((c) => c.spent > 0)
      .map((c) => {
        const raw = (c.spent / p.limit) * 100
        const room = Math.max(0, 100 - used)
        const width = Math.min(raw, room)
        used += width
        return {
          category: c.category,
          width,
          color: colorByCat.get(c.category) ?? COLORS[0],
        }
      })
      .filter((s) => s.width > 0)
  }, [p.categories, p.limit, colorByCat])

  return (
    <div className="space-y-4">
      {/* Overall headline */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">
          {formatMoney(p.spent)}{' '}
          <span className="text-sm font-normal text-slate-400">
            / {formatMoney(p.limit)}
          </span>
        </p>
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
          {segments.map((s) => (
            <div
              key={s.category}
              className="h-full transition-all"
              style={{ width: `${s.width}%`, backgroundColor: s.color }}
              title={s.category}
            />
          ))}
          {p.over && (
            <div
              className="h-full bg-money-out"
              style={{ width: '6%' }}
              title="Over budget"
            />
          )}
        </div>
        <p
          className={`mt-2 text-xs font-semibold ${p.over ? 'text-money-out' : 'text-money-in'}`}
        >
          {p.over
            ? `${formatMoney(Math.abs(p.remaining))} over`
            : `${formatMoney(p.remaining)} ${p.completed ? 'saved' : 'left'}`}
        </p>
      </div>

      {/* Per-category breakdown */}
      <div>
        <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          By category
        </span>
        {p.categories.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-xs text-slate-400 shadow-sm ring-1 ring-slate-100">
            No spending recorded in this budget's range yet.
          </p>
        ) : (
          <div className="space-y-2">
            {p.categories.map((c) => {
              const cpct =
                c.limit && c.limit > 0
                  ? Math.min(100, (c.spent / c.limit) * 100)
                  : null
              return (
                <div
                  key={c.category}
                  className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                      {colorByCat.has(c.category) && (
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: colorByCat.get(c.category) }}
                        />
                      )}
                      <span className="truncate">{c.category}</span>
                    </span>
                    <span className="shrink-0 text-sm text-slate-900">
                      {formatMoney(c.spent)}
                      {c.limit !== null && (
                        <span className="text-xs font-normal text-slate-400">
                          {' '}
                          / {formatMoney(c.limit)}
                        </span>
                      )}
                    </span>
                  </div>
                  {cpct !== null && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${c.over ? 'bg-money-out' : 'bg-money-in'}`}
                        style={{ width: `${c.over ? 100 : cpct}%` }}
                      />
                    </div>
                  )}
                  {c.remaining !== null && (
                    <p
                      className={`mt-1 text-xs font-medium ${c.over ? 'text-money-out' : 'text-slate-400'}`}
                    >
                      {c.over
                        ? `${formatMoney(Math.abs(c.remaining))} over limit`
                        : `${formatMoney(c.remaining)} left`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A single budget card. Live budgets show a spent-vs-cap progress bar; once the
 * range has elapsed it shows a completed summary â€” how much was saved or
 * overspent overall, and how many category limits were kept vs exceeded.
 */
function BudgetCard({
  budget,
  transactions,
  onOpen,
  onEdit,
  onDelete,
}: {
  budget: Budget
  transactions: import('../types').Transaction[]
  onOpen: () => void
  onEdit: () => void
  onDelete: (id: string, label: string) => void
}) {
  const p = useMemo(
    () => computeBudgetProgress(transactions, budget),
    [transactions, budget],
  )
  const label = `${formatDate(budget.startDate)} â€“ ${formatDate(budget.endDate)}`
  const pct = p.limit > 0 ? Math.min(100, (p.spent / p.limit) * 100) : 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-100 transition-colors hover:bg-slate-50"
      aria-label={`View budget details for ${label}`}
    >
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
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Edit budget"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(budget.id, label)
            }}
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
              {p.categoryLimitsOver > 0 ? ` Â· ${p.categoryLimitsOver} over` : ''}
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

