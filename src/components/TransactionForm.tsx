import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Loader2,
  Paperclip,
  Plus,
  SplitSquareHorizontal,
  Users,
  X,
} from 'lucide-react'
import { Modal } from './ui/Modal'
import { Field, inputClass } from './ui/Field'
import { useStore, personName } from '../store/useStore'
import { api } from '../lib/api'
import { DatePicker } from './ui/DatePicker'
import {
  ME_ID,
  type Category,
  type SplitShare,
  type TxType,
} from '../types'
import {
  addCustomCategory,
  allCategories,
  getCustomCategories,
} from '../lib/categories'
import { equalSplit } from '../lib/settlements'
import { formatMoney, round2, todayISO } from '../lib/format'

interface TransactionFormProps {
  open: boolean
  onClose: () => void
}

/**
 * Minimal transaction entry inside a modal overlay.
 * A single "Split this expense" toggle progressively reveals participant
 * selection and split configuration (equal split by default), keeping the
 * default flow uncluttered.
 */
export function TransactionForm({ open, onClose }: TransactionFormProps) {
  const people = useStore((s) => s.people)
  const addTransaction = useStore((s) => s.addTransaction)
  const settleUp = useStore((s) => s.settleUp)

  // 'expense' = money out (debit), 'income' = money in (credit).
  const [txType, setTxType] = useState<TxType>('expense')
  // Income only: optionally settle ONE person who repaid you. When set to a
  // person id, saving raises your balance AND clears that much of their debt
  // (surplus flips to money you owe them). The person is not notified.
  const [settleFrom, setSettleFrom] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('General')
  const [date, setDate] = useState(todayISO())

  // User-defined categories (persisted in localStorage). `addingCategory`
  // reveals an inline text input; `newCategory` holds its value.
  const [customCategories, setCustomCategories] = useState<string[]>(() =>
    getCustomCategories(),
  )
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  // Optional proof attachment. `attachment` holds the uploaded file's URL
  // (relative /api/uploads/...), `attachmentPreview` a local object URL for
  // instant image preview before/after upload.
  const [attachment, setAttachment] = useState<string | null>(null)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [attachmentIsImage, setAttachmentIsImage] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // True while the transaction is being saved — disables the submit button and
  // blocks re-entry so a double-click can't create two transactions.
  const [submitting, setSubmitting] = useState(false)

  // ~1.5 MB binary cap (matches the server limit).
  const ATTACHMENT_MAX_BYTES = 1_500_000

  const onPickAttachment = async (file: File | undefined) => {
    setAttachmentError(null)
    if (!file) return
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setAttachmentError('File is too large (max 1.5 MB).')
      return
    }
    // Immediate local preview for images.
    const isImage = file.type.startsWith('image/')
    setAttachmentIsImage(isImage)
    setAttachmentPreview(isImage ? URL.createObjectURL(file) : null)

    // Upload to disk; store the returned URL.
    setUploading(true)
    try {
      const { url, name } = await api.uploadAttachment(file)
      setAttachment(url)
      setAttachmentName(name)
    } catch (err) {
      setAttachmentError(
        err instanceof Error ? err.message : 'Could not upload that file.',
      )
      setAttachmentPreview(null)
    } finally {
      setUploading(false)
    }
  }

  const clearAttachment = () => {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachment(null)
    setAttachmentName(null)
    setAttachmentPreview(null)
    setAttachmentIsImage(false)
    setAttachmentError(null)
  }

  const categoryOptions = allCategories(customCategories)

  const commitNewCategory = () => {
    const name = newCategory.trim()
    if (!name) {
      setAddingCategory(false)
      return
    }
    setCustomCategories(addCustomCategory(name))
    setCategory(name)
    setNewCategory('')
    setAddingCategory(false)
  }

  const isIncome = txType === 'income'

  // Split state (only relevant for expenses)
  const [isSplit, setIsSplit] = useState(false)
  const [paidBy, setPaidBy] = useState<string>(ME_ID)
  // Selected participant ids (always includes ME_ID by default).
  const [participants, setParticipants] = useState<string[]>([ME_ID])
  // How the bill is divided among participants.
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  // Raw per-person input strings for custom mode, keyed by person id.
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})

  const numericAmount = round2(parseFloat(amount) || 0)

  // Splitting applies to EXPENSES only. Income is always personal; instead of
  // splitting, an income can optionally "settle up" one person (see settleFrom).
  const splitActive = isSplit && !isIncome

  // Shares each participant is responsible for, derived from the split mode.
  const shares: SplitShare[] = useMemo(() => {
    if (!splitActive) return []
    if (splitMode === 'custom') {
      return participants.map((personId) => ({
        personId,
        amount: round2(parseFloat(customAmounts[personId] ?? '') || 0),
      }))
    }
    return equalSplit(numericAmount, participants)
  }, [splitActive, splitMode, customAmounts, numericAmount, participants])

  // Sum of custom shares and how far it is from the total (for validation/UI).
  const customTotal = useMemo(
    () => round2(shares.reduce((sum, s) => sum + s.amount, 0)),
    [shares],
  )
  const customRemaining = round2(numericAmount - customTotal)
  // In custom mode the entered shares must add up to the total (within a cent).
  const customMatches = splitMode === 'custom' && Math.abs(customRemaining) < 0.01

  // Description is OPTIONAL — the amount (and a valid split, when enabled) is
  // all that's required to save.
  const canSubmit =
    !uploading &&
    numericAmount > 0 &&
    (!splitActive ||
      (participants.length >= 2 && (splitMode === 'equal' || customMatches)))

  const resetAndClose = () => {
    setTxType('expense')
    setAmount('')
    setDescription('')
    setCategory('General')
    setAddingCategory(false)
    setNewCategory('')
    clearAttachment()
    setDate(todayISO())
    setIsSplit(false)
    setPaidBy(ME_ID)
    setParticipants([ME_ID])
    setSplitMode('equal')
    setCustomAmounts({})
    setSettleFrom('')
    onClose()
  }

  const toggleParticipant = (id: string) => {
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  const setCustomAmount = (id: string, value: string) => {
    setCustomAmounts((prev) => ({ ...prev, [id]: value }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Guard against double-submit: bail if the form can't submit or a save is
    // already in flight (a fast second click / Enter press would otherwise add
    // the transaction twice).
    if (!canSubmit || submitting) return

    setSubmitting(true)
    try {
      // Income settling a person's repayment: raise your balance AND clear that
      // much of what they owe you (surplus flips to money you owe them). Handled
      // by a dedicated endpoint; the person is not notified.
      if (isIncome && settleFrom) {
        await settleUp(settleFrom, numericAmount, {
          date,
          description: description.trim() || undefined,
        })
        resetAndClose()
        return
      }

      // Persist via the API, then close only once the server confirms.
      await addTransaction({
        type: txType,
        description: description.trim(),
        amount: numericAmount,
        // Category is free-text end-to-end (the DB column is a plain string);
        // custom categories therefore persist fine. Cast for the union type.
        category: category as Category,
        date,
        isSplit: splitActive,
        // Only expense splits let another person be the payer; everything else
        // (personal expenses, all income) is paid/received by You.
        paidBy: splitActive ? paidBy : ME_ID,
        shares: splitActive ? shares : [],
        attachment,
        attachmentName,
      })
      resetAndClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title={isIncome ? 'New Income' : 'New Expense'}
    >
      <form onSubmit={submit}>
        {/* Expense / Income segmented toggle */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setTxType('expense')
              // "Settle up" only applies to income.
              setSettleFrom('')
            }}
            className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold transition-colors ${
              !isIncome
                ? 'bg-white text-money-out shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ArrowUpRight size={14} /> Expense
          </button>
          <button
            type="button"
            onClick={() => {
              setTxType('income')
              // Income is never split — turn off any split configured while this
              // was an expense and reset the payer to "You".
              setIsSplit(false)
              setPaidBy(ME_ID)
            }}
            className={`flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold transition-colors ${
              isIncome
                ? 'bg-white text-money-in shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <ArrowDownLeft size={14} /> Income
          </button>
        </div>

        {/* Amount — the hero input. */}
        <div className="border-b border-slate-100 pb-4">
          <label
            htmlFor="amount"
            className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400"
          >
            Amount
          </label>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-light ${
                isIncome ? 'text-money-in' : 'text-slate-300'
              }`}
            >
              ₹
            </span>
            <input
              id="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight placeholder:text-slate-200 focus:outline-none focus:ring-0 ${
                isIncome ? 'text-money-in' : 'text-slate-900'
              }`}
              autoFocus
            />
          </div>
        </div>

        <Field label="Description (optional)" htmlFor="description">
          <input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dinner, groceries, rent… (optional)"
            className={inputClass}
          />
        </Field>

        {/* Category — a tappable chip grid with an inline "add custom" flow. */}
        <div className="border-b border-slate-100 py-3">
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Category
          </span>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((c) => {
              const selected = c === category
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {c}
                </button>
              )
            })}

            {addingCategory ? (
              <input
                autoFocus
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onBlur={commitNewCategory}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitNewCategory()
                  } else if (e.key === 'Escape') {
                    setAddingCategory(false)
                    setNewCategory('')
                  }
                }}
                placeholder="New category"
                maxLength={24}
                className="w-32 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm ring-1 ring-slate-300 placeholder:text-slate-300 focus:outline-none focus:ring-slate-400"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingCategory(true)}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 ring-1 ring-dashed ring-slate-200 transition-colors hover:text-slate-700 hover:ring-slate-300"
              >
                <Plus size={12} /> Add
              </button>
            )}
          </div>
        </div>

        {/* Date — custom themed date picker. */}
        <div className="border-b border-slate-100 py-3">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Date
          </span>
          <DatePicker
            value={date}
            max={todayISO()}
            onChange={setDate}
            ariaLabel="Transaction date"
            fullWidth
          />
        </div>

        {/* Attachment — optional proof (receipt photo / PDF). */}
        <div className="border-b border-slate-100 py-3">
          <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Attachment <span className="normal-case text-slate-300">(optional)</span>
          </span>

          {attachment || uploading ? (
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
              {attachmentIsImage && attachmentPreview ? (
                <img
                  src={attachmentPreview}
                  alt="Attachment preview"
                  className="h-12 w-12 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white text-slate-400 ring-1 ring-slate-200">
                  <Paperclip size={16} />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                {uploading ? 'Uploading…' : (attachmentName ?? 'Attachment')}
              </span>
              <button
                type="button"
                onClick={clearAttachment}
                disabled={uploading}
                aria-label="Remove attachment"
                className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-dashed ring-slate-200 transition-colors hover:text-slate-800 hover:ring-slate-300">
              <Paperclip size={13} /> Add proof
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => onPickAttachment(e.target.files?.[0])}
              />
            </label>
          )}

          {attachmentError && (
            <p className="mt-1.5 text-[11px] font-medium text-money-out">
              {attachmentError}
            </p>
          )}
        </div>

        {/* Income only: settle ONE person's repayment. Choosing someone raises
            your balance by the amount AND reduces what they owe you. If the
            amount is more than they owed, the extra becomes money you owe them.
            The other person is not notified — they can log it themselves. */}
        {isIncome && people.length > 0 && (
          <div className="border-b border-slate-100 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              <Users size={12} /> Settle a repayment{' '}
              <span className="normal-case text-slate-300">(optional)</span>
            </div>
            <select
              value={settleFrom}
              onChange={(e) => setSettleFrom(e.target.value)}
              className="w-full cursor-pointer rounded-lg border-0 bg-slate-100 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              <option value="">No one — just add income</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} repaid me
                </option>
              ))}
            </select>
            {settleFrom && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                Adds {formatMoney(numericAmount)} to your balance and settles that
                much of what {personName(people, settleFrom)} owes you. Any surplus
                becomes money you owe them. They won't be notified.
              </p>
            )}
          </div>
        )}

        {/* Split toggle — expenses only. Income is never split. */}
        {!isIncome && (
        <>
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <SplitSquareHorizontal size={16} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700">
              Split this expense
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isSplit}
            onClick={() => {
              setIsSplit((v) => !v)
              // Ensure "You" are included when enabling split.
              setParticipants((prev) =>
                prev.includes(ME_ID) ? prev : [ME_ID, ...prev],
              )
            }}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              isSplit ? 'bg-slate-900' : 'bg-slate-200'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                isSplit ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Split sub-menu (revealed only when toggled on) */}
        {isSplit && (
          <div className="mb-2 space-y-4 rounded-xl bg-slate-50 p-4">
            {people.length === 0 ? (
              <p className="text-center text-xs text-slate-400">
                Add people first to split this expense.
              </p>
            ) : (
              <>
                {/* Paid by */}
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    <Users size={12} /> Paid by
                  </div>
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="w-full cursor-pointer rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                  >
                    <option value={ME_ID}>You</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Split mode: Equal / Custom */}
                <div>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Split method
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setSplitMode('equal')}
                      className={`rounded-full py-1.5 text-xs font-semibold transition-colors ${
                        splitMode === 'equal'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Equally
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitMode('custom')}
                      className={`rounded-full py-1.5 text-xs font-semibold transition-colors ${
                        splitMode === 'custom'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                </div>

                {/* Participants */}
                <div>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    {splitMode === 'custom'
                      ? 'Split between'
                      : 'Split equally between'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ParticipantChip
                      label="You"
                      selected={participants.includes(ME_ID)}
                      onClick={() => toggleParticipant(ME_ID)}
                    />
                    {people.map((p) => (
                      <ParticipantChip
                        key={p.id}
                        label={p.name}
                        selected={participants.includes(p.id)}
                        onClick={() => toggleParticipant(p.id)}
                      />
                    ))}
                  </div>
                </div>

                {participants.length < 2 && (
                  <p className="text-xs text-money-out">
                    Select at least two participants.
                  </p>
                )}

                {/* Equal mode: read-only breakdown preview */}
                {splitMode === 'equal' &&
                  numericAmount > 0 &&
                  participants.length >= 2 && (
                    <ul className="divide-y divide-slate-100 rounded-lg bg-white px-3 shadow-sm">
                      {shares.map((s) => (
                        <li
                          key={s.personId}
                          className="flex items-center justify-between py-2 text-sm"
                        >
                          <span className="text-slate-600">
                            {personName(people, s.personId)}
                          </span>
                          <span className="font-medium text-slate-900">
                            {formatMoney(s.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                {/* Custom mode: editable per-person amount inputs */}
                {splitMode === 'custom' && participants.length >= 2 && (
                  <div>
                    <ul className="divide-y divide-slate-100 rounded-lg bg-white px-3 shadow-sm">
                      {participants.map((id) => (
                        <li
                          key={id}
                          className="flex items-center justify-between gap-3 py-2 text-sm"
                        >
                          <span className="text-slate-600">
                            {personName(people, id)}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-slate-300">₹</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={customAmounts[id] ?? ''}
                              onChange={(e) =>
                                setCustomAmount(id, e.target.value)
                              }
                              placeholder="0.00"
                              className="w-24 border-0 bg-transparent p-0 text-right font-medium text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0"
                            />
                          </div>
                        </li>
                      ))}
                    </ul>

                    {/* Running total vs. bill total */}
                    <div className="mt-2 flex items-center justify-between px-1 text-xs">
                      <span className="text-slate-400">
                        {formatMoney(customTotal)} of {formatMoney(numericAmount)}
                      </span>
                      {Math.abs(customRemaining) < 0.01 ? (
                        <span className="font-medium text-money-in">
                          Balanced
                        </span>
                      ) : (
                        <span className="font-medium text-money-out">
                          {customRemaining > 0
                            ? `${formatMoney(customRemaining)} left`
                            : `${formatMoney(-customRemaining)} over`}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-30 ${
            isIncome ? 'bg-money-in' : 'bg-slate-900'
          }`}
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting
            ? 'Saving…'
            : isIncome
              ? 'Add Income'
              : 'Add Expense'}
        </button>
      </form>
    </Modal>
  )
}

/** Selectable, pill-shaped participant chip. */
function ParticipantChip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        selected
          ? 'bg-slate-900 text-white'
          : 'bg-white text-slate-500 shadow-sm hover:text-slate-900'
      }`}
    >
      {selected && <Check size={12} />}
      {label}
    </button>
  )
}
