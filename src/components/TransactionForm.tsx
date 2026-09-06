import { useEffect, useMemo, useState } from 'react'
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
import { Select } from './ui/Select'
import {
  ME_ID,
  type Category,
  type SplitShare,
  type Transaction,
  type TxType,
} from '../types'
import {
  addCustomCategory,
  allCategories,
  getCustomCategories,
} from '../lib/categories'
import { equalSplit } from '../lib/settlements'
import { loanOutstanding } from '../lib/loans'
import { formatMoney, round2, todayISO } from '../lib/format'

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  /**
   * When set, the form opens in EDIT mode pre-filled with this transaction and
   * saving PUTs an update instead of creating a new entry. Only transactions
   * you own and that aren't adjustments should be passed here.
   */
  editing?: Transaction | null
}

/**
 * Minimal transaction entry inside a modal overlay.
 * A single "Split this expense" toggle progressively reveals participant
 * selection and split configuration (equal split by default), keeping the
 * default flow uncluttered.
 */
export function TransactionForm({
  open,
  onClose,
  editing = null,
}: TransactionFormProps) {
  const people = useStore((s) => s.people)
  const loans = useStore((s) => s.loans)
  const addTransaction = useStore((s) => s.addTransaction)
  const updateTransaction = useStore((s) => s.updateTransaction)
  const settleUp = useStore((s) => s.settleUp)
  const repayLoan = useStore((s) => s.repayLoan)
  const isEditing = editing !== null
  // Surfaces a validation/404 error from an edit save inline in the form.
  const [saveError, setSaveError] = useState<string | null>(null)

  // 'expense' = money out (debit), 'income' = money in (credit).
  const [txType, setTxType] = useState<TxType>('expense')
  // Income only: optionally settle ONE person who repaid you. When set to a
  // person id, saving raises your balance AND clears that much of their debt
  // (surplus flips to money you owe them). The person is not notified.
  const [settleFrom, setSettleFrom] = useState<string>('')
  // Income only: optionally put part of this income toward repaying one of your
  // outstanding loans. `repayFromId` is the chosen loan id ('' = none);
  // `repayAmount` is the raw amount string (clamped to the loan's outstanding
  // and the income amount on save). Recorded via the existing repayLoan flow.
  const [repayFromId, setRepayFromId] = useState<string>('')
  const [repayAmount, setRepayAmount] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('General')
  const [date, setDate] = useState(todayISO())
  // Whether this expense counts toward spending budgets (default: included).
  // Income never counts, so this toggle only shows for expenses.
  const [includeInBudget, setIncludeInBudget] = useState(true)

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

  // Loans you can repay from an income: your own (not shared-in) loans that
  // still have an outstanding balance. Money you BORROWED that you're now
  // paying back, or money you LENT that's being written down — either way the
  // owner records the repayment. Only offered when adding new income.
  const repayableLoans = useMemo(
    () => loans.filter((l) => !l.sharedByMe && loanOutstanding(l) > 0),
    [loans],
  )
  const selectedRepayLoan = useMemo(
    () => repayableLoans.find((l) => l.id === repayFromId) ?? null,
    [repayableLoans, repayFromId],
  )

  // Split state (only relevant for expenses)
  const [isSplit, setIsSplit] = useState(false)
  const [paidBy, setPaidBy] = useState<string>(ME_ID)
  // Selected participant ids (always includes ME_ID by default).
  const [participants, setParticipants] = useState<string[]>([ME_ID])
  // How the bill is divided among participants.
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  // Raw per-person input strings for custom mode, keyed by person id.
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})

  // Prefill every field from the transaction being edited whenever the modal
  // opens in edit mode (and reset the inline error). Split bills restore their
  // participants, payer and per-person shares as a "custom" split so the exact
  // original amounts are preserved even if they weren't an even divide.
  useEffect(() => {
    if (!open || !editing) return
    setSaveError(null)
    setTxType(editing.type === 'income' ? 'income' : 'expense')
    setSettleFrom('')
    setAmount(String(editing.amount))
    setDescription(editing.description ?? '')
    setCategory(editing.category || 'General')
    setDate(editing.date)
    setIncludeInBudget(editing.includeInBudget !== false)
    setAttachment(editing.attachment ?? null)
    setAttachmentName(editing.attachmentName ?? null)
    setAttachmentPreview(null)
    setAttachmentIsImage(false)
    setAttachmentError(null)

    if (editing.isSplit && editing.shares.length > 0) {
      setIsSplit(true)
      setPaidBy(editing.paidBy || ME_ID)
      setParticipants(editing.shares.map((s) => s.personId))
      setSplitMode('custom')
      setCustomAmounts(
        Object.fromEntries(
          editing.shares.map((s) => [s.personId, String(s.amount)]),
        ),
      )
    } else {
      setIsSplit(false)
      setPaidBy(ME_ID)
      setParticipants([ME_ID])
      setSplitMode('equal')
      setCustomAmounts({})
    }
    // Only re-run when a different transaction is opened for editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

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
    setIncludeInBudget(true)
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
    setRepayFromId('')
    setRepayAmount('')
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
    setSaveError(null)
    try {
      // Income settling a person's repayment: raise your balance AND clear that
      // much of what they owe you (surplus flips to money you owe them). Handled
      // by a dedicated endpoint; the person is not notified. (Create-only — the
      // settle-up shortcut isn't offered while editing an existing entry.)
      if (!isEditing && isIncome && settleFrom) {
        await settleUp(settleFrom, numericAmount, {
          date,
          description: description.trim() || undefined,
        })
        resetAndClose()
        return
      }

      const payload = {
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
        // Income never counts toward budgets; for expenses, honor the toggle.
        includeInBudget: isIncome ? false : includeInBudget,
      }

      // Persist via the API, then close only once the server confirms.
      if (isEditing && editing) {
        await updateTransaction(editing.id, payload)
      } else {
        await addTransaction(payload)
        // Income → optionally put part of it toward repaying a loan. Done after
        // the income is saved; the repay amount is clamped to the loan's
        // outstanding and the income amount. Failures here surface inline but
        // the income itself is already recorded.
        if (isIncome && selectedRepayLoan) {
          const outstanding = loanOutstanding(selectedRepayLoan)
          const applied = round2(
            Math.min(parseFloat(repayAmount) || 0, outstanding, numericAmount),
          )
          if (applied > 0) await repayLoan(selectedRepayLoan.id, applied, date)
        }
      }
      resetAndClose()
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Could not save changes.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title={
        isEditing
          ? isIncome
            ? 'Edit Income'
            : 'Edit Expense'
          : isIncome
            ? 'New Income'
            : 'New Expense'
      }
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

        {/* Count toward budget — expenses only (income never counts). */}
        {!isIncome && (
          <div className="border-b border-slate-100 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-700">
                  Count toward budget
                </span>
                <span className="block text-[11px] text-slate-400">
                  Turn off to exclude this expense from budgets
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={includeInBudget}
                aria-label="Count toward budget"
                onClick={() => setIncludeInBudget((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
                  includeInBudget ? 'bg-slate-900' : 'bg-slate-100'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-neutral-100 shadow-sm transition-transform ${
                    includeInBudget ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

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
            <Select
              value={settleFrom}
              onChange={setSettleFrom}
              ariaLabel="Settle a repayment"
              buttonClassName="bg-slate-100 shadow-sm focus:ring-1 focus:ring-slate-300"
              options={[
                { value: '', label: 'No one — just add income' },
                ...people.map((p) => ({ value: p.id, label: `${p.name} repaid me` })),
              ]}
            />
            {settleFrom && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                Adds {formatMoney(numericAmount)} to your balance and settles that
                much of what {personName(people, settleFrom)} owes you. Any surplus
                becomes money you owe them. They won't be notified.
              </p>
            )}
          </div>
        )}
        {/* Income only: put part of this income toward repaying one of your
            outstanding loans. Records a repayment against the chosen loan
            (clamped to its outstanding balance and to this income's amount). */}
        {isIncome && !isEditing && repayableLoans.length > 0 && (
          <div className="border-b border-slate-100 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              <ArrowDownLeft size={12} /> Put toward a loan{' '}
              <span className="normal-case text-slate-300">(optional)</span>
            </div>
            <Select
              value={repayFromId}
              onChange={(id) => {
                setRepayFromId(id)
                // Prefill with the smaller of the loan's outstanding or the
                // income amount, so the common "repay in full" case is one tap.
                const loan = repayableLoans.find((l) => l.id === id)
                if (loan) {
                  const suggested = round2(
                    Math.min(loanOutstanding(loan), numericAmount || loanOutstanding(loan)),
                  )
                  setRepayAmount(suggested > 0 ? String(suggested) : '')
                } else {
                  setRepayAmount('')
                }
              }}
              ariaLabel="Put toward a loan"
              buttonClassName="bg-slate-100 shadow-sm focus:ring-1 focus:ring-slate-300"
              options={[
                { value: '', label: 'No loan — just add income' },
                ...repayableLoans.map((l) => ({
                  value: l.id,
                  label: `${l.direction === 'borrowed' ? 'Repay' : 'Write down'} ${personName(
                    people,
                    l.personId,
                  )} · ${formatMoney(loanOutstanding(l))} left`,
                })),
              ]}
            />
            {selectedRepayLoan && (
              <>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  placeholder="Amount to apply"
                  className="mt-2 w-full rounded-lg border-0 bg-slate-100 px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                />
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Applies up to{' '}
                  {formatMoney(
                    round2(
                      Math.min(
                        parseFloat(repayAmount) || 0,
                        loanOutstanding(selectedRepayLoan),
                        numericAmount || 0,
                      ),
                    ),
                  )}{' '}
                  toward this loan (outstanding{' '}
                  {formatMoney(loanOutstanding(selectedRepayLoan))}). The income
                  is still recorded in full.
                </p>
              </>
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
            aria-label="Split this expense"
            onClick={() => {
              setIsSplit((v) => !v)
              // Ensure "You" are included when enabling split.
              setParticipants((prev) =>
                prev.includes(ME_ID) ? prev : [ME_ID, ...prev],
              )
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${
              isSplit ? 'bg-slate-900' : 'bg-slate-100'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-neutral-100 shadow-sm transition-transform ${
                isSplit ? 'translate-x-[22px]' : 'translate-x-0.5'
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
                  <Select
                    value={paidBy}
                    onChange={setPaidBy}
                    ariaLabel="Paid by"
                    buttonClassName="bg-white shadow-sm focus:ring-1 focus:ring-slate-300"
                    options={[
                      { value: ME_ID, label: 'You' },
                      ...people.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
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

        {saveError && (
          <p className="mt-3 text-center text-xs font-medium text-money-out">
            {saveError}
          </p>
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
            : isEditing
              ? 'Save changes'
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
