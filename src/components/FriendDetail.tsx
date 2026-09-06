import { useMemo, useState } from 'react'
import { HandCoins, Loader2, Plus, Trash2 } from 'lucide-react'
import { useStore, personName } from '../store/useStore'
import { useConfirm } from './ui/ConfirmDialog'
import { Modal } from './ui/Modal'
import { ME_ID, type Loan, type Transaction } from '../types'
import { formatMoney, formatDate } from '../lib/format'
import { computePairwiseSettlements } from '../lib/settlements'
import {
  loanOutstanding,
  loanAccruedInterest,
  loanRepaidTotal,
  loanNetWithPerson,
} from '../lib/loans'
import { LoanForm } from './LoanForm'

/**
 * Per-friend detail: every outstanding item you share with one person —
 * the net split balance, each individual loan (with live accrued interest and
 * repayments), and the combined position. Works the same for both sides
 * (payer & payee) because the underlying data is mirrored two-sided.
 */
export function FriendDetail({ personId }: { personId: string }) {
  const transactions = useStore((s) => s.transactions)
  const loans = useStore((s) => s.loans)
  const people = useStore((s) => s.people)
  const repayLoan = useStore((s) => s.repayLoan)
  const removeLoan = useStore((s) => s.removeLoan)
  const confirm = useConfirm()

  const [adding, setAdding] = useState(false)
  // Record-repayment modal state: the loan being repaid (null = closed), the
  // raw amount input, an inline error, and an in-flight flag.
  const [repayFor, setRepayFor] = useState<Loan | null>(null)
  const [repayInput, setRepayInput] = useState('')
  const [repayError, setRepayError] = useState<string | null>(null)
  const [repaySaving, setRepaySaving] = useState(false)
  const name = personName(people, personId)

  // Net split balance with this person (positive → they owe you).
  const splitNet = useMemo(() => {
    const s = computePairwiseSettlements(transactions).find(
      (x) => x.from === personId || x.to === personId,
    )
    if (!s) return 0
    return s.to === ME_ID ? s.amount : -s.amount
  }, [transactions, personId])

  // Individual split bills involving this person (non-adjustment), newest first.
  const splitTxns = useMemo(
    () =>
      transactions
        .filter(
          (t) =>
            t.isSplit &&
            !t.isAdjustment &&
            (t.paidBy === personId ||
              t.shares.some((sh) => sh.personId === personId)),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, personId],
  )

  const myLoans = useMemo(
    () => loans.filter((l) => l.personId === personId),
    [loans, personId],
  )
  const loanNet = useMemo(
    () => loanNetWithPerson(loans, personId),
    [loans, personId],
  )

  // Open the themed repayment modal for a loan (replaces the native prompt).
  const openRepay = (loan: Loan) => {
    setRepayFor(loan)
    setRepayInput('')
    setRepayError(null)
  }

  const closeRepay = () => {
    if (repaySaving) return
    setRepayFor(null)
    setRepayInput('')
    setRepayError(null)
  }

  const submitRepay = async () => {
    if (!repayFor || repaySaving) return
    const outstanding = loanOutstanding(repayFor)
    const amt = Number(repayInput)
    if (!Number.isFinite(amt) || amt <= 0) {
      setRepayError('Enter an amount greater than zero.')
      return
    }
    if (amt > outstanding + 0.001) {
      setRepayError(`That's more than the ${formatMoney(outstanding)} outstanding.`)
      return
    }
    setRepaySaving(true)
    setRepayError(null)
    try {
      await repayLoan(repayFor.id, amt)
      setRepayFor(null)
      setRepayInput('')
    } catch (err) {
      setRepayError(
        err instanceof Error ? err.message : 'Could not record the repayment.',
      )
    } finally {
      setRepaySaving(false)
    }
  }

  const del = async (loan: Loan) => {
    const ok = await confirm({
      title: 'Delete this loan?',
      message: 'This removes the loan and its repayment history. Cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) await removeLoan(loan.id)
  }

  return (
    <div className="space-y-5">
      {/* Split position headline. This mirrors the Dashboard "Settlements"
          figure exactly — it reflects SPLIT BILLS ONLY (no loans), because
          settlements never include loans. The loan balance is shown as its own
          line below so the two numbers stay consistent across the app. */}
      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Overall with {name}
        </p>
        <p
          className={`mt-1 text-2xl font-semibold tracking-tight ${
            splitNet > 0
              ? 'text-money-in'
              : splitNet < 0
                ? 'text-money-out'
                : 'text-slate-900'
          }`}
        >
          {splitNet > 0 ? '+' : splitNet < 0 ? '−' : ''}
          {formatMoney(Math.abs(splitNet))}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {splitNet > 0
            ? `${name} owes you on split bills`
            : splitNet < 0
              ? `You owe ${name} on split bills`
              : 'All settled up on split bills'}
        </p>
        {/* Loan balance shown separately (kept out of the settlement figure). */}
        {loanNet !== 0 && (
          <p className="mt-1.5 border-t border-slate-200/70 pt-1.5 text-[11px] text-slate-400">
            Loans:{' '}
            <span
              className={
                loanNet > 0
                  ? 'font-semibold text-money-in'
                  : 'font-semibold text-money-out'
              }
            >
              {loanNet > 0 ? '+' : '−'}
              {formatMoney(Math.abs(loanNet))}
            </span>{' '}
            {loanNet > 0 ? `${name} owes you` : `you owe ${name}`}
          </p>
        )}
      </div>

      {/* Loans section */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Loans
          </span>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            <Plus size={13} /> Lend / borrow
          </button>
        </div>

        {adding && (
          <div className="mb-3 rounded-xl bg-slate-50 p-3">
            <LoanForm personId={personId} onDone={() => setAdding(false)} />
          </div>
        )}

        {myLoans.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
            No loans with {name} yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {myLoans.map((loan) => {
              const out = loanOutstanding(loan)
              const interest = loanAccruedInterest(loan)
              const repaid = loanRepaidTotal(loan)
              const theyOwe = loan.direction === 'lent'
              return (
                <li
                  key={loan.id}
                  className="rounded-xl bg-white p-3 ring-1 ring-slate-100"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {theyOwe ? `${name} owes you` : `You owe ${name}`}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {loan.interestType === 'none'
                          ? 'No interest'
                          : `${loan.interestType} · ${loan.ratePct}%/mo`}{' '}
                        · from {formatDate(loan.startDate)}
                      </p>
                      {loan.description && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {loan.description}
                        </p>
                      )}
                    </div>
                    <p
                      className={`shrink-0 text-sm font-semibold ${
                        theyOwe ? 'text-money-in' : 'text-money-out'
                      }`}
                    >
                      {formatMoney(out)}
                    </p>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                    <span>Principal {formatMoney(loan.principal)}</span>
                    {interest > 0 && <span>Interest {formatMoney(interest)}</span>}
                    {repaid > 0 && <span>Repaid {formatMoney(repaid)}</span>}
                  </div>

                  {/* Only the loan owner can record repayments / delete it. */}
                  {!loan.sharedByMe && (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openRepay(loan)}
                        disabled={out <= 0}
                        className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-40"
                      >
                        <HandCoins size={12} /> Record repayment
                      </button>
                      <button
                        type="button"
                        onClick={() => del(loan)}
                        aria-label="Delete loan"
                        className="rounded-full p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-money-out"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Split bills section */}
      <div>
        <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Split bills
        </span>
        {splitTxns.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-400">
            No split bills with {name}.
          </p>
        ) : (
          <ul className="space-y-2">
            {splitTxns.map((t) => (
              <SplitRow key={t.id} tx={t} personId={personId} people={people} />
            ))}
          </ul>
        )}
      </div>

      {/* Themed "Record repayment" modal (replaces the native window.prompt). */}
      <Modal
        open={repayFor !== null}
        onClose={closeRepay}
        title="Record repayment"
      >
        {repayFor && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitRepay()
            }}
            className="space-y-4"
          >
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              {repayFor.direction === 'lent'
                ? `${name} owes you`
                : `You owe ${name}`}{' '}
              <span className="font-semibold text-slate-800">
                {formatMoney(loanOutstanding(repayFor))}
              </span>{' '}
              outstanding.
            </div>

            <div>
              <label
                htmlFor="repay-amount"
                className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400"
              >
                Amount repaid
              </label>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-light text-slate-300">₹</span>
                <input
                  id="repay-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={repayInput}
                  onChange={(e) => {
                    setRepayInput(e.target.value)
                    if (repayError) setRepayError(null)
                  }}
                  placeholder="0.00"
                  autoFocus
                  className="w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight text-slate-900 placeholder:text-slate-200 focus:outline-none focus:ring-0"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setRepayInput(String(loanOutstanding(repayFor)))
                }
                className="mt-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200"
              >
                Repay full ({formatMoney(loanOutstanding(repayFor))})
              </button>
            </div>

            {repayError && (
              <p className="text-[11px] font-medium text-money-out">
                {repayError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeRepay}
                disabled={repaySaving}
                className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={repaySaving}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              >
                {repaySaving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <HandCoins size={15} />
                )}
                Record
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

/** One split bill row from the viewer's perspective with this person. */
function SplitRow({
  tx,
  personId,
  people,
}: {
  tx: Transaction
  personId: string
  people: import('../types').Person[]
}) {
  // Directional amount between YOU and this person for this bill:
  //  - you paid  → they owe you their share (+)
  //  - they paid → you owe them your share (−)
  let delta = 0
  if (tx.paidBy === ME_ID) {
    const theirs = tx.shares.find((s) => s.personId === personId)
    if (theirs) delta = theirs.amount
  } else if (tx.paidBy === personId) {
    const mine = tx.shares.find((s) => s.personId === ME_ID)
    if (mine) delta = -mine.amount
  }
  const label = tx.description.trim() || tx.category
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-100">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{label}</p>
        <p className="text-[11px] text-slate-400">
          {formatDate(tx.date)} · {personName(people, tx.paidBy)} paid{' '}
          {formatMoney(tx.amount)}
        </p>
      </div>
      <p
        className={`shrink-0 text-sm font-semibold ${
          delta > 0 ? 'text-money-in' : delta < 0 ? 'text-money-out' : 'text-slate-400'
        }`}
      >
        {delta > 0 ? '+' : delta < 0 ? '−' : ''}
        {formatMoney(Math.abs(delta))}
      </p>
    </li>
  )
}


