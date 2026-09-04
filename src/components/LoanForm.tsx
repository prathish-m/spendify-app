import { useState } from 'react'
import { HandCoins, Loader2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { DatePicker } from './ui/DatePicker'
import { todayISO } from '../lib/format'
import type { LoanDirection, LoanInterestType } from '../types'

/**
 * Form to lend money to (or borrow from) a friend, optionally with interest.
 * Rendered inside the friend-detail sheet. On save it calls the store's
 * `createLoan` and invokes `onDone` so the parent can refresh / collapse.
 */
export function LoanForm({
  personId,
  onDone,
}: {
  personId: string
  onDone: () => void
}) {
  const createLoan = useStore((s) => s.createLoan)

  const [direction, setDirection] = useState<LoanDirection>('lent')
  const [amount, setAmount] = useState('')
  const [interestType, setInterestType] = useState<LoanInterestType>('none')
  const [ratePct, setRatePct] = useState('')
  const [compoundsPerYear, setCompoundsPerYear] = useState(12)
  const [startDate, setStartDate] = useState(todayISO())
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numericAmount = Number(amount)
  const canSubmit = Number.isFinite(numericAmount) && numericAmount > 0

  const submit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    setError(null)
    try {
      await createLoan({
        personId,
        direction,
        principal: numericAmount,
        interestType,
        ratePct: interestType === 'none' ? 0 : Number(ratePct) || 0,
        compoundsPerYear: interestType === 'compound' ? compoundsPerYear : 1,
        startDate,
        description: description.trim(),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record loan.')
    } finally {
      setSaving(false)
    }
  }

  const seg = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
      active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
    }`

  return (
    <div className="space-y-4">
      {/* Direction */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDirection('lent')}
          className={seg(direction === 'lent')}
        >
          I lent
        </button>
        <button
          type="button"
          onClick={() => setDirection('borrowed')}
          className={seg(direction === 'borrowed')}
        >
          I borrowed
        </button>
      </div>

      {/* Amount */}
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Principal
        </label>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300"
        />
      </div>

      {/* Interest type */}
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Interest
        </label>
        <div className="flex gap-2">
          {(['none', 'simple', 'compound'] as LoanInterestType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setInterestType(t)}
              className={seg(interestType === t)}
            >
              {t === 'none' ? 'None' : t === 'simple' ? 'Simple' : 'Compound'}
            </button>
          ))}
        </div>
      </div>

      {/* Rate + compounding (only when interest applies) */}
      {interestType !== 'none' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Annual rate (%)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={ratePct}
              onChange={(e) => setRatePct(e.target.value)}
              placeholder="e.g. 12"
              className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300"
            />
          </div>
          {interestType === 'compound' && (
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Compounds
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCompoundsPerYear(12)}
                  className={seg(compoundsPerYear === 12)}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setCompoundsPerYear(1)}
                  className={seg(compoundsPerYear === 1)}
                >
                  Yearly
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Start date */}
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Start date
        </label>
        <DatePicker
          value={startDate}
          onChange={setStartDate}
          ariaLabel="Loan start date"
          fullWidth
        />
      </div>

      {/* Optional note */}
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Note <span className="normal-case text-slate-300">(optional)</span>
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this for?"
          className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300"
        />
      </div>

      {error && <p className="text-[11px] text-money-out">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit || saving}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {saving ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <HandCoins size={15} />
        )}
        Record loan
      </button>
    </div>
  )
}

