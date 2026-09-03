import { ME_ID, type Budget, type Transaction } from '../types'
import { round2 } from './format'

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Analytics helpers for the dashboards / charts.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * All figures are computed from the *viewer's* perspective, mirroring the
 * personal-balance logic used elsewhere:
 *   - a personal (non-split) expense costs you its full amount
 *   - a split expense costs you only your own share
 *   - income entries add to money-in
 *   - balance adjustments are excluded so charts reflect real activity
 */

export type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

/** Your out-of-pocket cost for a single expense transaction. */
export function yourSpend(t: Transaction): number {
  if (t.type === 'income') return 0
  if (!t.isSplit) return t.amount
  const mine = t.shares.find((s) => s.personId === ME_ID)
  return mine ? mine.amount : 0
}

/**
 * The money-in *you* keep from an income transaction. For a split income only
 * your own share is yours (the rest is owed to the other participants); a
 * personal income counts in full.
 */
export function yourIncome(t: Transaction): number {
  if (t.type !== 'income') return 0
  if (!t.isSplit || t.shares.length === 0) return t.amount
  const mine = t.shares.find((s) => s.personId === ME_ID)
  return mine ? mine.amount : 0
}

const startOfWeek = (d: Date): Date => {
  const copy = new Date(d)
  const day = copy.getDay() // 0 = Sun
  const diff = (day + 6) % 7 // days since Monday
  copy.setDate(copy.getDate() - diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Bucket key + human label for a date under a given period. The key sorts
 * chronologically as a plain string, which keeps our time-series ordered.
 */
export function bucketOf(
  iso: string,
  period: Period,
): { key: string; label: string } {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return { key: iso, label: iso }

  const y = d.getFullYear()
  const m = d.getMonth() // 0-based
  const monthShort = d.toLocaleDateString(undefined, { month: 'short' })

  switch (period) {
    case 'daily':
      return {
        key: `${y}-${pad(m + 1)}-${pad(d.getDate())}`,
        label: d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
      }
    case 'weekly': {
      const s = startOfWeek(d)
      return {
        key: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
        label: `Wk of ${s.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}`,
      }
    }
    case 'monthly':
      return { key: `${y}-${pad(m + 1)}`, label: `${monthShort} ${y}` }
    case 'quarterly': {
      const q = Math.floor(m / 3) + 1
      return { key: `${y}-Q${q}`, label: `Q${q} ${y}` }
    }
    case 'yearly':
      return { key: `${y}`, label: `${y}` }
  }
}

export interface TimePoint {
  key: string
  label: string
  spend: number
  income: number
}

/**
 * Spend & income aggregated into time buckets for the chosen period,
 * chronologically ordered. Adjustments are excluded.
 */
export function spendOverTime(
  transactions: Transaction[],
  period: Period,
): TimePoint[] {
  const map = new Map<string, TimePoint>()
  for (const t of transactions) {
    if (t.isAdjustment) continue
    const { key, label } = bucketOf(t.date, period)
    if (!map.has(key)) map.set(key, { key, label, spend: 0, income: 0 })
    const point = map.get(key)!
    if (t.type === 'income')
      point.income = round2(point.income + yourIncome(t))
    else point.spend = round2(point.spend + yourSpend(t))
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export interface CategorySlice {
  category: string
  amount: number
}

/**
 * Your spend grouped by category (expenses only, adjustments excluded),
 * sorted from largest to smallest.
 */
export function spendByCategory(
  transactions: Transaction[],
): CategorySlice[] {
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.type === 'income' || t.isAdjustment) continue
    const amt = yourSpend(t)
    if (amt <= 0) continue
    map.set(t.category, round2((map.get(t.category) ?? 0) + amt))
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

/** Restrict a transaction list to those whose bucket key is in `keys`. */
export function filterByBuckets(
  transactions: Transaction[],
  period: Period,
  keys: Set<string>,
): Transaction[] {
  if (keys.size === 0) return transactions
  return transactions.filter((t) => keys.has(bucketOf(t.date, period).key))
}

export interface AnalyticsSummary {
  totalSpend: number
  totalIncome: number
  avgPerBucket: number
  topCategory: CategorySlice | null
  bucketCount: number
}

// ─── Budgets ────────────────────────────────────────────────────────────────

/** A budget's default range: the first→last day of the current month (local). */
export function currentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() // 0-based
  const start = `${y}-${pad(m + 1)}-01`
  const lastDay = new Date(y, m + 1, 0).getDate() // day 0 of next month
  const end = `${y}-${pad(m + 1)}-${pad(lastDay)}`
  return { start, end }
}

/** Whether an ISO date falls within a budget's inclusive range. */
function inBudgetRange(date: string, budget: Budget): boolean {
  return date >= budget.startDate && date <= budget.endDate
}

/**
 * Pick the budget whose range covers `date` (ranges never overlap, so at most
 * one matches). Defaults to today. Returns null when no budget covers it.
 */
export function activeBudget(
  budgets: Budget[],
  date: string = new Date().toISOString().slice(0, 10),
): Budget | null {
  return budgets.find((b) => inBudgetRange(date, b)) ?? null
}

export interface CategoryBudgetProgress {
  category: string
  spent: number
  /** The per-category cap, or null when this category has no explicit limit. */
  limit: number | null
  /** Spent minus limit (only meaningful when a limit exists). */
  remaining: number | null
  /** True when a limit exists and spend exceeded it. */
  over: boolean
}

export interface BudgetProgress {
  budget: Budget
  /** Your total spend (expenses only, adjustments excluded) within the range. */
  spent: number
  /** Overall cap. */
  limit: number
  /** limit − spent (negative when overspent). */
  remaining: number
  /** Fraction 0..1+ of the cap used (can exceed 1 when overspent). */
  ratio: number
  /** True when total spend exceeded the overall cap. */
  over: boolean
  /** Per-category breakdown, largest spend first. */
  categories: CategoryBudgetProgress[]
}

/**
 * Compute spend progress against a budget: the overall spent-vs-cap plus a
 * per-category breakdown (each category's spend and, when set, its own limit).
 * Only expenses within the budget's inclusive date range are counted, using the
 * viewer's own out-of-pocket share (adjustments excluded), mirroring the other
 * analytics helpers.
 */
export function computeBudgetProgress(
  transactions: Transaction[],
  budget: Budget,
): BudgetProgress {
  const byCategory = new Map<string, number>()
  let spent = 0

  for (const t of transactions) {
    if (t.type === 'income' || t.isAdjustment) continue
    if (!inBudgetRange(t.date, budget)) continue
    const amt = yourSpend(t)
    if (amt <= 0) continue
    spent = round2(spent + amt)
    const cat = t.category || 'General'
    byCategory.set(cat, round2((byCategory.get(cat) ?? 0) + amt))
  }

  const limitByCat = new Map(
    budget.categoryLimits.map((l) => [l.category, l.amount]),
  )

  // Union of categories that were spent in OR have a defined limit, so an
  // unspent-but-budgeted category still shows (spent 0 of its limit).
  const cats = new Set<string>([...byCategory.keys(), ...limitByCat.keys()])
  const categories: CategoryBudgetProgress[] = [...cats]
    .map((category) => {
      const catSpent = round2(byCategory.get(category) ?? 0)
      const limit = limitByCat.has(category) ? limitByCat.get(category)! : null
      const remaining = limit === null ? null : round2(limit - catSpent)
      return {
        category,
        spent: catSpent,
        limit,
        remaining,
        over: limit !== null && catSpent > limit,
      }
    })
    .sort((a, b) => b.spent - a.spent)

  const limit = budget.amount
  const remaining = round2(limit - spent)
  return {
    budget,
    spent,
    limit,
    remaining,
    ratio: limit > 0 ? spent / limit : 0,
    over: spent > limit,
    categories,
  }
}

/** Headline numbers derived from the time series + category breakdown. */
export function summarize(
  series: TimePoint[],
  categories: CategorySlice[],
): AnalyticsSummary {
  const totalSpend = round2(series.reduce((s, p) => s + p.spend, 0))
  const totalIncome = round2(series.reduce((s, p) => s + p.income, 0))
  const bucketCount = series.length
  return {
    totalSpend,
    totalIncome,
    avgPerBucket: bucketCount ? round2(totalSpend / bucketCount) : 0,
    topCategory: categories[0] ?? null,
    bucketCount,
  }
}
