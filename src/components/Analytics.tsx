import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart3,
  Filter,
  PieChart as PieIcon,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useTheme } from '../lib/theme'
import { formatMoney, formatDate } from '../lib/format'
import { DatePicker } from './ui/DatePicker'
import {
  CHART_COLORS as COLORS,
  ACCENT_COLOR,
  MONEY_IN_COLOR,
  MONEY_OUT_COLOR,
} from '../lib/colors'
import {
  PERIODS,
  spendByCategory,
  spendOverTime,
  summarize,
  activeBudget,
  computeBudgetProgress,
  type CategorySlice,
  type Period,
  type TimePoint,
} from '../lib/analytics'

/** Compact currency for axis ticks, e.g. 12500 -> "Rs 12.5k". */
function compactMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`
  return `₹${Math.round(n)}`
}

function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-slate-400">
      {icon}
      <span className="text-xs font-medium uppercase tracking-wider">
        {title}
      </span>
    </div>
  )
}

/** Shared tooltip that formats every value as currency. */
function MoneyTooltip(props: {
  active?: boolean
  payload?: any[]
  label?: string
}) {
  const { active, payload, label } = props
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-100">
      {label !== undefined && (
        <p className="mb-1 font-medium text-slate-700">{label}</p>
      )}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color ?? p.payload?.fill }}
          />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-medium text-slate-800">
            {formatMoney(Number(p.value))}
          </span>
        </p>
      ))}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'in' | 'out'
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-lg font-semibold tracking-tight ${
          tone === 'in'
            ? 'text-money-in'
            : tone === 'out'
              ? 'text-money-out'
              : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

function SpendOverTimeChart({ series }: { series: TimePoint[] }) {
  const isDark = useTheme((s) => s.theme === 'dark')
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <CardHeader icon={<TrendingUp size={15} />} title="Cost spent over time" />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT_COLOR} stopOpacity={0.25} />
                <stop offset="100%" stopColor={ACCENT_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            {!isDark && (
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            )}
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={compactMoney} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<MoneyTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
            <Area type="monotone" dataKey="spend" name="Spent" stroke={ACCENT_COLOR} strokeWidth={2} fill="url(#spendFill)" />
            <Line type="monotone" dataKey="income" name="Income" stroke={MONEY_IN_COLOR} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CategoryDonut({
  categories,
  hasExpenses,
}: {
  categories: CategorySlice[]
  hasExpenses: boolean
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <CardHeader icon={<PieIcon size={15} />} title="Category-wise spend" />
      {!hasExpenses ? (
        <p className="py-12 text-center text-xs text-slate-300">
          No expenses to break down yet.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={categories} dataKey="amount" nameKey="category" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {categories.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<MoneyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function TopCategoriesBar({
  categories,
  hasExpenses,
}: {
  categories: CategorySlice[]
  hasExpenses: boolean
}) {
  const isDark = useTheme((s) => s.theme === 'dark')
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <CardHeader icon={<BarChart3 size={15} />} title="Top categories" />
      {!hasExpenses ? (
        <p className="py-12 text-center text-xs text-slate-300">No expenses yet.</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={categories.slice(0, 7)} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
              {!isDark && (
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
              )}
              <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={80} />
              <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc' }} content={<MoneyTooltip />} />
              <Bar dataKey="amount" name="Spent" radius={[0, 6, 6, 0]}>
                {categories.slice(0, 7).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function IncomeVsExpenseChart({ series }: { series: TimePoint[] }) {
  const isDark = useTheme((s) => s.theme === 'dark')
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <CardHeader icon={<Wallet size={15} />} title="Income vs. expense" />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            {!isDark && (<CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />)}
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={compactMoney} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} />
            <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc' }} content={<MoneyTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="income" name="Income" fill={MONEY_IN_COLOR} radius={[4, 4, 0, 0]} />
            <Bar dataKey="spend" name="Spent" fill={MONEY_OUT_COLOR} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** A thin labelled progress bar used inside the budget indicator. */
function BudgetBar({
  spent,
  limit,
  over,
}: {
  spent: number
  limit: number
  over: boolean
}) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all ${
          over ? 'bg-money-out' : 'bg-money-in'
        }`}
        style={{ width: `${over ? 100 : pct}%` }}
      />
    </div>
  )
}

/**
 * Budget indicator: shows the budget covering the selected "From" date (or
 * today when unset) — overall spent vs cap with over/under status, plus a
 * per-category breakdown. Category rows with an explicit limit show their own
 * over/under; others just show spend within the range.
 */
function BudgetIndicator({ anchorDate }: { anchorDate: string }) {
  const transactions = useStore((s) => s.transactions)
  const budgets = useStore((s) => s.budgets)

  const budget = useMemo(
    () => activeBudget(budgets, anchorDate),
    [budgets, anchorDate],
  )
  const progress = useMemo(
    () => (budget ? computeBudgetProgress(transactions, budget) : null),
    [budget, transactions],
  )

  if (!budget || !progress) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <CardHeader icon={<Wallet size={15} />} title="Budget" />
        <p className="py-6 text-center text-xs text-slate-300">
          No budget covers this period. Create one from the Budgets screen.
        </p>
      </div>
    )
  }

  const { spent, limit, remaining, over, categories } = progress
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <CardHeader icon={<Wallet size={15} />} title="Budget" />

      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          {formatMoney(spent)}
          <span className="text-sm font-normal text-slate-400">
            {' '}
            / {formatMoney(limit)}
          </span>
        </span>
        <span
          className={`text-xs font-semibold ${
            over ? 'text-money-out' : 'text-money-in'
          }`}
        >
          {over
            ? `${formatMoney(Math.abs(remaining))} over`
            : `${formatMoney(remaining)} left`}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-slate-400">
        {formatDate(budget.startDate)} – {formatDate(budget.endDate)}
      </p>
      <BudgetBar spent={spent} limit={limit} over={over} />

      {categories.length > 0 && (
        <div className="mt-4 space-y-3">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
            By category
          </span>
          {categories.map((c) => (
            <div key={c.category} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium text-slate-600">
                  {c.category}
                </span>
                <span className="shrink-0 text-slate-500">
                  {formatMoney(c.spent)}
                  {c.limit !== null && (
                    <span className="text-slate-300">
                      {' '}
                      / {formatMoney(c.limit)}
                    </span>
                  )}
                  {c.limit !== null && (
                    <span
                      className={`ml-1.5 font-semibold ${
                        c.over ? 'text-money-out' : 'text-money-in'
                      }`}
                    >
                      {c.over ? 'over' : 'ok'}
                    </span>
                  )}
                </span>
              </div>
              {c.limit !== null && (
                <BudgetBar spent={c.spent} limit={c.limit} over={c.over} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const periodNoun: Record<Period, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
}

/**
 * Analytics dashboard: charts summarizing spend, all driven by a single
 * period selector (daily/weekly/monthly/quarterly/yearly).
 */
export function Analytics() {
  const transactions = useStore((s) => s.transactions)
  const [period, setPeriod] = useState<Period>('monthly')
  // Optional inclusive date range (YYYY-MM-DD). Empty string = unbounded.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // ── Insights-only exclusion filters ────────────────────────────────────
  // These hide certain categories and/or all split bills FROM THE INSIGHTS
  // charts + stats only. They intentionally do NOT touch the Dashboard's
  // balance / net-position cards, which always reflect all transactions.
  const [showFilters, setShowFilters] = useState(false)
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(
    new Set(),
  )
  const [excludeSplits, setExcludeSplits] = useState(false)

  // Distinct categories present across all transactions, sorted, for the picker.
  const categoryList = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) set.add(t.category || 'General')
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [transactions])

  const toggleCategory = (cat: string) => {
    setExcludedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const clearExclusions = () => {
    setExcludedCategories(new Set())
    setExcludeSplits(false)
  }

  const exclusionCount = excludedCategories.size + (excludeSplits ? 1 : 0)

  // Restrict to the chosen range AND apply the exclusion filters before any
  // aggregation. Date bounds are inclusive; either can be left blank for an
  // open-ended range.
  const inRange = useMemo(() => {
    return transactions.filter((t) => {
      if (from && t.date < from) return false
      if (to && t.date > to) return false
      if (excludeSplits && t.isSplit) return false
      if (excludedCategories.has(t.category || 'General')) return false
      return true
    })
  }, [transactions, from, to, excludeSplits, excludedCategories])

  const { series, categories, summary } = useMemo(() => {
    const series = spendOverTime(inRange, period)
    const categories = spendByCategory(inRange)
    return { series, categories, summary: summarize(series, categories) }
  }, [inRange, period])

  const rangeActive = Boolean(from || to)

  const hasExpenses = categories.length > 0
  const hasAnyActivity = series.length > 0

  return (
    <section className="space-y-4">
      {/* Header + period filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Insights
          </h2>
        </div>
        <div className="ml-auto flex flex-wrap gap-1 rounded-full bg-slate-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === p.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date-range filter */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium uppercase tracking-wider text-slate-400">
          Range
        </span>
        <DatePicker
          value={from}
          max={to || undefined}
          onChange={setFrom}
          placeholder="From"
          ariaLabel="From date"
        />
        <span className="text-slate-300">→</span>
        <DatePicker
          value={to}
          min={from || undefined}
          onChange={setTo}
          placeholder="To"
          ariaLabel="To date"
        />
        {rangeActive && (
          <button
            onClick={() => {
              setFrom('')
              setTo('')
            }}
            className="rounded-full px-2.5 py-1 font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            Clear
          </button>
        )}

        {/* Insights-only exclusion filters (categories / splits). */}
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <Filter size={13} />
          Filters
          {exclusionCount > 0 && (
            <span className="rounded-full bg-slate-900 px-1.5 text-[10px] font-semibold text-white">
              {exclusionCount}
            </span>
          )}
        </button>
      </div>

      {/* Exclusion filter panel — affects the Insights charts/stats only. */}
      {showFilters && (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Exclude from insights
            </span>
            {exclusionCount > 0 && (
              <button
                type="button"
                onClick={clearExclusions}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>

          {/* Exclude split bills */}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={excludeSplits}
              onChange={(e) => setExcludeSplits(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
            />
            Exclude split bills
          </label>

          {/* Exclude categories */}
          <div>
            <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Categories
            </span>
            {categoryList.length === 0 ? (
              <p className="text-xs text-slate-300">No categories yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categoryList.map((cat) => {
                  const excluded = excludedCategories.has(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        excluded
                          ? 'bg-money-out/10 text-money-out line-through'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      aria-pressed={excluded}
                    >
                      {excluded && <X size={11} />}
                      {cat}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {!hasAnyActivity ? (
        <div className="rounded-2xl bg-white p-8 text-center text-xs text-slate-400 shadow-sm ring-1 ring-slate-100">
          Add some transactions to see your insights.
        </div>
      ) : (
        <>
          {/* Summary stat chips */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total spent" value={formatMoney(summary.totalSpend)} />
            <Stat
              label="Total income"
              value={formatMoney(summary.totalIncome)}
              tone="in"
            />
            <Stat
              label={`Avg / ${periodNoun[period]}`}
              value={formatMoney(summary.avgPerBucket)}
            />
            <Stat
              label="Top category"
              value={summary.topCategory?.category ?? '—'}
              sub={
                summary.topCategory
                  ? formatMoney(summary.topCategory.amount)
                  : undefined
              }
            />
          </div>

          {/* Budget indicator — over/underspend for the budget covering the
              selected "From" date (or today when unset), plus categories. */}
          <BudgetIndicator anchorDate={from || new Date().toISOString().slice(0, 10)} />

          <SpendOverTimeChart series={series} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryDonut categories={categories} hasExpenses={hasExpenses} />
            <TopCategoriesBar
              categories={categories}
              hasExpenses={hasExpenses}
            />
          </div>

          <IncomeVsExpenseChart series={series} />
        </>
      )}
    </section>
  )
}
