import type { Loan } from '../types'
import { round2 } from './format'

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Loan interest + due math
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  A loan accrues interest on its principal from `startDate` until "now"
 *  (or an explicit as-of date). Interest is derived live on the client from
 *  the stored parameters — nothing is precomputed server-side — so the amount
 *  due naturally grows over time.
 *
 *  Interest is computed on a MONTHLY basis (the stored `ratePct` is a monthly
 *  percentage rate, and time is measured in fractional months):
 *
 *    none      → due = principal
 *    simple    → due = principal × (1 + r × m)
 *    compound  → due = principal × (1 + r)^m   (compounds every month)
 *
 *  where r = ratePct/100 (per month) and m = elapsed months.
 *  Recorded repayments are then subtracted to get the outstanding balance.
 */

// Average month length in ms (365.25 days / 12) — gives smooth fractional
// month accrual regardless of which calendar months the loan spans.
const MS_PER_MONTH = (365.25 / 12) * 24 * 60 * 60 * 1000

/** Elapsed time in (fractional) months between an ISO start date and `asOf`. */
export function elapsedMonths(startISO: string, asOf: Date = new Date()): number {
  const start = new Date(startISO + 'T00:00:00')
  if (Number.isNaN(start.getTime())) return 0
  const ms = asOf.getTime() - start.getTime()
  return ms <= 0 ? 0 : ms / MS_PER_MONTH
}

/**
 * The gross amount owed (principal + accrued interest) as of `asOf`, BEFORE
 * subtracting repayments. Interest accrues MONTHLY (see the header). Never less
 * than the principal (interest can't go negative even if a future start date
 * yields m=0).
 */
export function loanGrossDue(loan: Loan, asOf: Date = new Date()): number {
  const p = loan.principal
  if (loan.interestType === 'none' || loan.ratePct <= 0) return round2(p)

  const r = loan.ratePct / 100 // monthly rate
  const m = elapsedMonths(loan.startDate, asOf)

  if (loan.interestType === 'simple') {
    return round2(p * (1 + r * m))
  }
  // compound — compounds once per month
  return round2(p * Math.pow(1 + r, m))
}

/** Sum of all repayments recorded against a loan. */
export function loanRepaidTotal(loan: Loan): number {
  return round2((loan.repayments || []).reduce((s, r) => s + r.amount, 0))
}

/** Accrued interest so far (gross due − principal). */
export function loanAccruedInterest(loan: Loan, asOf: Date = new Date()): number {
  return round2(loanGrossDue(loan, asOf) - loan.principal)
}

/**
 * Outstanding amount still due as of `asOf`: gross (principal + interest)
 * minus repayments, floored at 0. This is the figure shown in the friend
 * detail view and folded into settlement totals.
 */
export function loanOutstanding(loan: Loan, asOf: Date = new Date()): number {
  const due = round2(loanGrossDue(loan, asOf) - loanRepaidTotal(loan))
  return due < 0 ? 0 : due
}

/**
 * Signed loan balance with the loan's counterparty, from YOUR perspective:
 *   positive → they owe you (you lent);
 *   negative → you owe them (you borrowed).
 * Fully-repaid loans contribute 0.
 */
export function loanSignedBalance(loan: Loan, asOf: Date = new Date()): number {
  const out = loanOutstanding(loan, asOf)
  return loan.direction === 'lent' ? out : -out
}

/** Net signed loan balance across every loan with a given person. */
export function loanNetWithPerson(
  loans: Loan[],
  personId: string,
  asOf: Date = new Date(),
): number {
  return round2(
    loans
      .filter((l) => l.personId === personId)
      .reduce((s, l) => s + loanSignedBalance(l, asOf), 0),
  )
}

/** One person's net loan position (positive → they owe you; negative → you owe). */
export interface LoanPersonBalance {
  personId: string
  /** Signed net across all loans with this person. */
  net: number
}

/** Aggregate loan totals across everyone, for the overall "Loan settlement" view. */
export interface LoanTotals {
  /** People who owe YOU on net (their loans lent to them), largest first. */
  owedToYou: LoanPersonBalance[]
  /** People YOU owe on net (loans you borrowed), largest first. */
  youOwe: LoanPersonBalance[]
  /** Sum of every person's positive net (what you're owed via loans). */
  totalOwedToYou: number
  /** Sum of every person's negative net magnitude (what you owe via loans). */
  totalYouOwe: number
}

/**
 * Roll every loan up into per-person net balances and split them into the
 * "you" perspective (mirrors `getMySettlements` for splits). A person whose
 * loans net to ~0 is omitted from both lists.
 */
export function computeLoanTotals(
  loans: Loan[],
  asOf: Date = new Date(),
): LoanTotals {
  const EPS = 0.01
  const byPerson: Record<string, number> = {}
  for (const l of loans) {
    byPerson[l.personId] =
      (byPerson[l.personId] ?? 0) + loanSignedBalance(l, asOf)
  }

  const owedToYou: LoanPersonBalance[] = []
  const youOwe: LoanPersonBalance[] = []
  let totalOwedToYou = 0
  let totalYouOwe = 0

  for (const [personId, raw] of Object.entries(byPerson)) {
    const net = round2(raw)
    if (net > EPS) {
      owedToYou.push({ personId, net })
      totalOwedToYou += net
    } else if (net < -EPS) {
      youOwe.push({ personId, net })
      totalYouOwe += -net
    }
  }

  owedToYou.sort((a, b) => b.net - a.net)
  youOwe.sort((a, b) => a.net - b.net) // most negative first

  return {
    owedToYou,
    youOwe,
    totalOwedToYou: round2(totalOwedToYou),
    totalYouOwe: round2(totalYouOwe),
  }
}
