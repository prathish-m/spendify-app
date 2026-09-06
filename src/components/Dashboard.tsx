import { useState, useMemo } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Scale,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { useStore, personName } from '../store/useStore'
import {
  computePairwiseSettlements,
  computePersonalBalance,
  getMySettlements,
} from '../lib/settlements'
import { computeLoanTotals } from '../lib/loans'
import { formatMoney, round2 } from '../lib/format'

/**
 * Small inline balance editor. Shows a pencil affordance next to a value;
 * clicking it reveals a number input to type a new value. On save it calls
 * `onSave(newValue)` — the store then records a correcting adjustment.
 */
function InlineBalanceEdit({
  onSave,
  initial,
  title,
}: {
  onSave: (value: number) => void
  initial: number
  title: string
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const start = () => {
    setValue(String(initial))
    setEditing(true)
  }
  const commit = () => {
    const parsed = parseFloat(value)
    if (!Number.isNaN(parsed)) onSave(parsed)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        title={title}
        aria-label={title}
        className="rounded-full p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <Pencil size={13} />
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-24 rounded-md border-0 bg-slate-100 px-2 py-1 text-right text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-300"
      />
      <button
        type="button"
        onClick={commit}
        aria-label="Save"
        className="rounded-full p-1 text-money-in transition-colors hover:bg-money-in/10"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        aria-label="Cancel"
        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
      >
        <X size={14} />
      </button>
    </span>
  )
}

/**
 * Dashboard = the headline balance cards: your personal cash-flow balance and
 * your overall net position across everyone you split with. Settlements live
 * in their own component (see `Settlements`) so pages can compose them freely.
 */
export function Dashboard() {
  const transactions = useStore((s) => s.transactions)
  const loans = useStore((s) => s.loans)
  const adjustPersonalBalance = useStore((s) => s.adjustPersonalBalance)

  // Derive everything from the single source of truth (memoized).
  // We use PAIRWISE settlements so every person you share bills with shows up
  // individually under "who owes you" / "who you owe" — rather than being
  // collapsed onto a single counterpart by group debt-minimization.
  //
  // NOTE: the balance cards ALWAYS reflect ALL transactions. The category /
  // split exclusion filters live on the Insights (Analytics) section and must
  // never change these headline balances.
  const { personal, my, loanTotals } = useMemo(() => {
    const settlements = computePairwiseSettlements(transactions)
    return {
      personal: computePersonalBalance(transactions),
      my: getMySettlements(settlements),
      loanTotals: computeLoanTotals(loans),
    }
  }, [transactions, loans])

  // Net Position = your personal cash balance
  //   + money others owe you (splits) + money you lent (loans)
  //   − money you owe others (splits) − money you borrowed (loans).
  const net = round2(
    personal.net +
      my.totalOwedToYou +
      loanTotals.totalOwedToYou -
      my.totalYouOwe -
      loanTotals.totalYouOwe,
  )

  return (
    <section className="space-y-4">
      {/* Headline cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-3 flex items-center gap-2 text-slate-400">
            <Wallet size={15} />
            <span className="text-xs font-medium uppercase tracking-wider">
              Personal Balance
            </span>
            <span className="ml-auto">
              <InlineBalanceEdit
                initial={personal.net}
                title="Edit personal balance"
                onSave={adjustPersonalBalance}
              />
            </span>
          </div>
          <p
            className={`text-3xl font-semibold tracking-tight ${
              personal.net > 0
                ? 'text-money-in'
                : personal.net < 0
                  ? 'text-money-out'
                  : 'text-slate-900'
            }`}
          >
            {personal.net > 0 ? '+' : ''}
            {formatMoney(personal.net)}
          </p>
          {/* Income vs. spend breakdown */}
          <p className="mt-1 text-xs text-slate-400">
            <span className="text-money-in">
              +{formatMoney(personal.income)} in
            </span>
            {' · '}
            <span className="text-money-out">
              −{formatMoney(personal.spend)} out
            </span>
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-3 flex items-center gap-2 text-slate-400">
            <Scale size={15} />
            <span className="text-xs font-medium uppercase tracking-wider">
              Net Position
            </span>
          </div>
          <p
            className={`text-3xl font-semibold tracking-tight ${
              net > 0
                ? 'text-money-in'
                : net < 0
                  ? 'text-money-out'
                  : 'text-slate-900'
            }`}
          >
            {net > 0 ? '+' : ''}
            {formatMoney(net)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {net > 0
              ? "You're up overall"
              : net < 0
                ? "You're down overall"
                : 'All settled up'}
            <span className="text-slate-300"> · balance + splits + loans</span>
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * Settlements = two independent breakdowns, each with a "Who owes you" /
 * "Who you owe" split:
 *   1. Split settlement — pairwise balances from shared bills (editable inline).
 *   2. Loan settlement  — net position from loans you lent / borrowed
 *      (read-only here; manage individual loans in the friend detail view).
 * Lives on its own so it can be placed on a different page from the balance
 * cards.
 */
export function Settlements() {
  const transactions = useStore((s) => s.transactions)
  const loans = useStore((s) => s.loans)
  const people = useStore((s) => s.people)
  const adjustSettlement = useStore((s) => s.adjustSettlement)

  const my = useMemo(
    () => getMySettlements(computePairwiseSettlements(transactions)),
    [transactions],
  )
  const loanTotals = useMemo(() => computeLoanTotals(loans), [loans])

  const splitEmpty = my.owedToYou.length === 0 && my.youOwe.length === 0
  const loanEmpty =
    loanTotals.owedToYou.length === 0 && loanTotals.youOwe.length === 0

  return (
    <section className="space-y-4">
      {/* 1) Split settlement — inline-editable pairwise balances from bills. */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h2 className="mb-4 text-sm font-semibold tracking-tight text-slate-900">
          Split settlement
        </h2>

        {splitEmpty ? (
          <p className="py-4 text-center text-xs text-slate-400">
            No outstanding split balances. Everyone is settled up. 🎉
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Who owes you */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-money-in">
                <ArrowDownLeft size={14} />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Who owes you
                </span>
              </div>
              {my.owedToYou.length === 0 ? (
                <p className="text-xs text-slate-300">Nothing owed to you.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {my.owedToYou.map((s) => (
                    <li
                      key={s.from}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="text-slate-700">
                        {personName(people, s.from)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-money-in">
                          {formatMoney(s.amount)}
                        </span>
                        <InlineBalanceEdit
                          initial={s.amount}
                          title={`Edit balance with ${personName(people, s.from)}`}
                          onSave={(v) => adjustSettlement(s.from, v)}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Who you owe */}
            <div className="border-t border-slate-100 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <div className="mb-2 flex items-center gap-1.5 text-money-out">
                <ArrowUpRight size={14} />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Who you owe
                </span>
              </div>
              {my.youOwe.length === 0 ? (
                <p className="text-xs text-slate-300">You owe nothing.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {my.youOwe.map((s) => (
                    <li
                      key={s.to}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="text-slate-700">
                        {personName(people, s.to)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium text-money-out">
                          {formatMoney(s.amount)}
                        </span>
                        {/* You owe → current signed balance is negative.
                            The editor shows/edits the owed magnitude, so we
                            negate it back into a signed balance on save. */}
                        <InlineBalanceEdit
                          initial={s.amount}
                          title={`Edit balance with ${personName(people, s.to)}`}
                          onSave={(v) => adjustSettlement(s.to, -v)}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2) Loan settlement — net loan position per person (read-only). */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h2 className="mb-4 text-sm font-semibold tracking-tight text-slate-900">
          Loan settlement
        </h2>

        {loanEmpty ? (
          <p className="py-4 text-center text-xs text-slate-400">
            No outstanding loans. 🎉
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Who owes you (loans you lent) */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-money-in">
                <ArrowDownLeft size={14} />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Who owes you
                </span>
              </div>
              {loanTotals.owedToYou.length === 0 ? (
                <p className="text-xs text-slate-300">Nothing owed to you.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {loanTotals.owedToYou.map((l) => (
                    <li
                      key={l.personId}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="text-slate-700">
                        {personName(people, l.personId)}
                      </span>
                      <span className="font-medium text-money-in">
                        {formatMoney(l.net)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Who you owe (loans you borrowed) */}
            <div className="border-t border-slate-100 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <div className="mb-2 flex items-center gap-1.5 text-money-out">
                <ArrowUpRight size={14} />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Who you owe
                </span>
              </div>
              {loanTotals.youOwe.length === 0 ? (
                <p className="text-xs text-slate-300">You owe nothing.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {loanTotals.youOwe.map((l) => (
                    <li
                      key={l.personId}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="text-slate-700">
                        {personName(people, l.personId)}
                      </span>
                      <span className="font-medium text-money-out">
                        {formatMoney(-l.net)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
