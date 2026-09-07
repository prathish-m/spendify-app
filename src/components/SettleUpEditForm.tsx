import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { DatePicker } from './ui/DatePicker'
import { useStore } from '../store/useStore'
import type { Transaction } from '../types'
import { round2, todayISO } from '../lib/format'

/**
 * Edit modal for a settle-up ("Repayment") entry.
 *
 * A settle-up is stored as TWO paired ledger rows (a visible income cash-in and
 * a hidden split debt-clear). Only three fields are user-editable — amount,
 * date and description — because the type/split/paidBy structure is what makes
 * the settlement work. Saving PUTs `/settle-up/:id`, which updates BOTH halves
 * server-side in lock-step, so the "who owes whom" balance stays correct.
 *
 * This is deliberately a lightweight form (not the full TransactionForm), since
 * none of the split/category/attachment controls apply to a settlement.
 */
export function SettleUpEditForm({
  tx,
  open,
  onClose,
}: {
  tx: Transaction
  open: boolean
  onClose: () => void
}) {
  const updateSettleUp = useStore((s) => s.updateSettleUp)

  const [amount, setAmount] = useState(String(tx.amount))
  const [date, setDate] = useState(tx.date || todayISO())
  const [description, setDescription] = useState(tx.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numericAmount = round2(parseFloat(amount) || 0)
  const canSubmit = numericAmount > 0 && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      await updateSettleUp(tx.id, numericAmount, {
        date,
        description: description.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit settlement">
      <p className="mb-2 text-[11px] text-slate-400">
        Editing keeps your balance with this person in sync automatically.
      </p>

      <Field label="Amount" htmlFor="settle-amount">
        <input
          id="settle-amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label="Date">
        <DatePicker value={date} onChange={setDate} fullWidth max={todayISO()} />
      </Field>

      <Field label="Description" htmlFor="settle-desc">
        <input
          id="settle-desc"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Repayment"
          className={inputClass}
        />
      </Field>

      {error && (
        <p className="mt-3 text-xs font-medium text-money-out">{error}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-slate-900 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {saving ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Check size={15} />
        )}
        Save changes
      </button>
    </Modal>
  )
}
