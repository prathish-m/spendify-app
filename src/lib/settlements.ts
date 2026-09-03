import { ME_ID, type Person, type Settlement, type Transaction } from '../types'
import { round2 } from './format'

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Settlement engine
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  For every split transaction, the payer (`paidBy`) fronts the full amount
 *  and each participant "consumes" their share. A person's net balance is:
 *
 *      net = (total they paid) - (total they consumed)
 *
 *    net > 0  → they are owed money (a creditor)
 *    net < 0  → they owe money      (a debtor)
 *
 *  We then greedily match the biggest creditor with the biggest debtor to
 *  produce a minimal list of transfers ("who owes whom").
 */

/** Compute the net balance for every known person + you. */
export function computeNetBalances(
  transactions: Transaction[],
  people: Person[],
): Record<string, number> {
  const balances: Record<string, number> = { [ME_ID]: 0 }
  for (const p of people) balances[p.id] = 0

  for (const t of transactions) {
    // Only split transactions create inter-person debt. Income is always
    // personal now, so in practice only expenses reach this branch.
    if (!t.isSplit || t.shares.length === 0) continue

    // The payer put in the full amount → credit them.
    balances[t.paidBy] = (balances[t.paidBy] ?? 0) + t.amount

    // Each participant consumed their share → debit them.
    for (const share of t.shares) {
      balances[share.personId] = (balances[share.personId] ?? 0) - share.amount
    }
  }

  // Clean up floating point noise.
  for (const id of Object.keys(balances)) balances[id] = round2(balances[id])
  return balances
}

/**
 * Greedy debt simplification.
 *
 * Produces the minimal set of directional transfers that settles all
 * balances. Runs in O(n log n) per matching step — plenty fast for the
 * small friend groups this app targets.
 */
export function simplifyDebts(
  balances: Record<string, number>,
): Settlement[] {
  const EPS = 0.01

  const creditors = Object.entries(balances)
    .filter(([, v]) => v > EPS)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount)

  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -EPS)
    .map(([id, amount]) => ({ id, amount: -amount })) // store owed as positive
    .sort((a, b) => b.amount - a.amount)

  const settlements: Settlement[] = []
  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor = debtors[di]
    const transfer = round2(Math.min(creditor.amount, debtor.amount))

    if (transfer > 0) {
      settlements.push({ from: debtor.id, to: creditor.id, amount: transfer })
    }

    creditor.amount = round2(creditor.amount - transfer)
    debtor.amount = round2(debtor.amount - transfer)

    if (creditor.amount <= EPS) ci++
    if (debtor.amount <= EPS) di++
  }

  return settlements
}

/**
 * Pairwise settlements from *your* perspective.
 *
 * Unlike `simplifyDebts` (which minimizes the number of transfers for the
 * whole group and therefore collapses everyone onto a single payer), this
 * computes your **direct** net position with each individual person, summed
 * across every split bill.
 *
 * For each split transaction we look at your relationship with the payer /
 * the other participants:
 *   - If YOU paid, every other participant owes you their share.
 *   - If SOMEONE ELSE paid, you owe the payer your share.
 * We accumulate these per-person and net them so that, for example, a bill
 * you paid and a bill they paid partially cancel out.
 *
 * Result: `youOwe` / `owedToYou` list every person you have an outstanding
 * balance with — not just one collapsed counterpart.
 */
export function computePairwiseSettlements(
  transactions: Transaction[],
): Settlement[] {
  // Positive net[personId] → that person owes YOU; negative → YOU owe them.
  const net: Record<string, number> = {}

  for (const t of transactions) {
    if (!t.isSplit || t.shares.length === 0) continue

    // Only expenses create inter-person debt (income is always personal now).
    if (t.paidBy === ME_ID) {
      // Expense you paid → each *other* participant owes you their share.
      for (const share of t.shares) {
        if (share.personId === ME_ID) continue
        net[share.personId] = (net[share.personId] ?? 0) + share.amount
      }
    } else {
      // Someone else is the payer → your relationship is via YOUR share.
      const myShare = t.shares.find((s) => s.personId === ME_ID)
      if (myShare) {
        net[t.paidBy] = (net[t.paidBy] ?? 0) - myShare.amount
      }
      // Note: debts strictly between two *other* people are intentionally
      // ignored here — this view is about what YOU owe / are owed.
    }
  }

  const settlements: Settlement[] = []
  for (const [personId, rawAmount] of Object.entries(net)) {
    const amount = round2(rawAmount)
    if (amount > 0.01) {
      // They owe you.
      settlements.push({ from: personId, to: ME_ID, amount })
    } else if (amount < -0.01) {
      // You owe them.
      settlements.push({ from: ME_ID, to: personId, amount: round2(-amount) })
    }
  }

  return settlements
}

/** Convenience: settlements that only involve you. */
export interface MySettlements {
  /** People who owe you money, with amounts. */
  owedToYou: Settlement[]
  /** People you owe money, with amounts. */
  youOwe: Settlement[]
  /** Sum of everything owed to you. */
  totalOwedToYou: number
  /** Sum of everything you owe. */
  totalYouOwe: number
}

/** Split the full settlement list into the "you" perspective for the UI. */
export function getMySettlements(settlements: Settlement[]): MySettlements {
  const owedToYou = settlements.filter((s) => s.to === ME_ID)
  const youOwe = settlements.filter((s) => s.from === ME_ID)

  return {
    owedToYou,
    youOwe,
    totalOwedToYou: round2(owedToYou.reduce((sum, s) => sum + s.amount, 0)),
    totalYouOwe: round2(youOwe.reduce((sum, s) => sum + s.amount, 0)),
  }
}

/** Breakdown of your personal cash flow. */
export interface PersonalBalance {
  /** Total money in (sum of income entries). */
  income: number
  /** Total money out that expenses cost you. */
  spend: number
  /** Net = income − spend (positive means you're up overall). */
  net: number
}

/**
 * Your personal cash flow.
 *
 * Spending = everything you actually consumed:
 *  - full amount of personal (non-split) expenses you logged, plus
 *  - your own share of any split bills.
 * Income = the full amount of every 'income' entry.
 * Net reflects money in minus money out.
 */
export function computePersonalBalance(
  transactions: Transaction[],
): PersonalBalance {
  let income = 0
  let spend = 0

  for (const t of transactions) {
    // A split adjustment (isAdjustment && isSplit) is a settlement-only movement
    // — e.g. the debt-clear half of a repayment. It must NOT affect your
    // personal cash on either side; the matching cash side is a separate entry.
    if (t.isAdjustment && t.isSplit) continue
    if (t.type === 'income') {
      // Income is always personal (never split) → the full amount is money-in.
      income += t.amount
      continue
    }
    // Expense (default).
    if (!t.isSplit) {
      spend += t.amount
    } else {
      const myShare = t.shares.find((s) => s.personId === ME_ID)
      if (myShare) spend += myShare.amount
    }
  }

  income = round2(income)
  spend = round2(spend)
  return { income, spend, net: round2(income - spend) }
}

/**
 * Split an amount equally across participants, distributing any rounding
 * remainder (in cents) onto the first participants so the shares sum exactly
 * to the total.
 */
export function equalSplit(
  amount: number,
  participantIds: string[],
): { personId: string; amount: number }[] {
  const n = participantIds.length
  if (n === 0) return []

  const cents = Math.round(amount * 100)
  const base = Math.floor(cents / n)
  let remainder = cents - base * n

  return participantIds.map((personId) => {
    let share = base
    if (remainder > 0) {
      share += 1
      remainder -= 1
    }
    return { personId, amount: round2(share / 100) }
  })
}
