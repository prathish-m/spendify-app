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
 *    none      → due = principal
 *    simple    → due = principal × (1 + r × t)
 *    compound  → due = principal × (1 + r/n)^(n × t)
 *
 *  where r = ratePct/100 (annual), t = elapsed years, n = compounds per year.
 *  Recorded repayments are then subtracted to get the outstanding balance.
 */

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

/** Elapsed time in (fractional) years between an ISO start date and `asOf`. */
export function elapsedYears(startISO: string, asOf: Date = new Date()): number {
  const start = new Date(startISO + 'T00:00:00')
  if (Number.isNaN(start.getTime())) return 0
  const ms = asOf.getTime() - start.getTime()
  return ms <= 0 ? 0 : ms / MS_PER_YEAR
}

/**
 * The gross amount owed (principal + accrued interest) as of `asOf`, BEFORE
 * subtracting repayments. Never less than the principal (interest can't go
 * negative even if a future start date yields t=0).
 */
export function loanGrossDue(loan: Loan, asOf: Date = new Date()): number {
  const p = loan.principal
  if (loan.interestType === 'none' || loan.ratePct <= 0) return round2(p)

  const r = loan.ratePct / 100
  const t = elapsedYears(loan.startDate, asOf)

  if (loan.interestType === 'simple') {
    return round2(p * (1 + r * t))
  }
  // compound
  const n = Math.max(1, loan.compoundsPerYear || 1)
  return round2(p * Math.pow(1 + r / n, n * t))
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
