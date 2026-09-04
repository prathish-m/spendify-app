import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Paperclip,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useStore, personName } from '../store/useStore'
import { attachmentUrl } from '../lib/api'
import { useConfirm } from './ui/ConfirmDialog'
import { TransactionDetail } from './ui/TransactionDetail'
import { FullScreenSheet } from './ui/FullScreenSheet'
import { ME_ID, type Transaction } from '../types'
import { formatDate, formatMoney } from '../lib/format'

/**
 * A human label for a transaction. Description is optional, so fall back to the
 * category (or a generic word) when it's blank — used in the list, detail view,
 * confirm dialogs, and accessibility labels.
 */
function txLabel(tx: Transaction): string {
  return tx.description.trim() || tx.category || 'Untitled'
}

/**
 * Scrollable, divided list of past transactions.
 * A small badge distinguishes personal expenses from split group bills.
 * Supports a selection mode for deleting several entries at once.
 */
export function TransactionHistory() {
  const transactions = useStore((s) => s.transactions)
  const people = useStore((s) => s.people)
  const removeTransaction = useStore((s) => s.removeTransaction)
  const removeTransactions = useStore((s) => s.removeTransactions)
  const respondToTransaction = useStore((s) => s.respondToTransaction)
  const confirm = useConfirm()

  // Free-text search over description, category, and involved people.
  const [search, setSearch] = useState('')

  // Multi-select state.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Detailed-view state: the transaction currently expanded in a modal.
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)

  // Full-screen "see all" view: the compact card shows only the latest few;
  // this opens the complete, searchable/selectable list.
  const [showAll, setShowAll] = useState(false)
  const PREVIEW_COUNT = 5

  // Filtered + sorted view driven by the search box. We match against the
  // description, category, and the names of everyone involved (payer +
  // participants).
  //
  // Sorting is ALWAYS by the transaction `date` the user picked (newest first),
  // NOT by `createdAt`. This means back-dating or future-dating an entry places
  // it correctly in the timeline. `createdAt` is only a stable tiebreaker so
  // several entries sharing the same date keep a deterministic order.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = !q
      ? transactions
      : transactions.filter((t) => {
          const names = [
            personName(people, t.paidBy),
            ...t.shares.map((s) => personName(people, s.personId)),
            t.sharedByName ?? '',
          ]
          const haystack = [t.description, t.category, ...names]
            .join(' ')
            .toLowerCase()
          return haystack.includes(q)
        })

    // Copy before sorting so we never mutate the store's array in place.
    return [...matches].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return (b.createdAt ?? 0) - (a.createdAt ?? 0)
    })
  }, [transactions, people, search])

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected =
    filtered.length > 0 && filtered.every((t) => selected.has(t.id))

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((t) => t.id)))
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    const ok = await confirm({
      title: `Delete ${selected.size} ${
        selected.size === 1 ? 'transaction' : 'transactions'
      }?`,
      message: 'This permanently removes the selected entries.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await removeTransactions([...selected])
    exitSelectMode()
  }

  // Single-delete with confirmation (owner only).
  const confirmDelete = async (tx: Transaction) => {
    const ok = await confirm({
      title: 'Delete this transaction?',
      message: `"${txLabel(tx)}" will be permanently removed.`,
      confirmLabel: 'Delete',
    })
    if (ok) await removeTransaction(tx.id)
  }

  // Reject a shared split (full opt-out) with confirmation.
  const confirmReject = async (tx: Transaction) => {
    const ok = await confirm({
      title: 'Reject this shared split?',
      message: `"${txLabel(tx)}" will be removed from your history and won't count in your balances. ${tx.sharedByName ?? 'The owner'} keeps it on their side.`,
      confirmLabel: 'Reject',
    })
    if (ok) await respondToTransaction(tx.id, 'rejected')
  }

  // Renders a transaction list; `selectable` enables the multi-select controls
  // (used inside the full-screen view only). `rows` is the slice to display.
  const renderList = (rows: Transaction[], selectable: boolean) => (
    <ul className="divide-y divide-slate-50">
      {rows.map((t) => (
        <Row
          key={t.id}
          tx={t}
          people={people}
          selectMode={selectable && selectMode}
          selected={selected.has(t.id)}
          onToggleSelect={() => toggleSelect(t.id)}
          onOpen={() => setDetailTx(t)}
          onDelete={() => confirmDelete(t)}
          onAccept={() => respondToTransaction(t.id, 'accepted')}
          onReject={() => confirmReject(t)}
        />
      ))}
    </ul>
  )

  const preview = filtered.slice(0, PREVIEW_COUNT)
  const hasMore = transactions.length > PREVIEW_COUNT

  const openAll = () => setShowAll(true)
  const closeAll = () => {
    setShowAll(false)
    exitSelectMode()
    setSearch('')
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">
          History
        </h2>
        <span className="text-xs text-slate-400">
          {transactions.length}{' '}
          {transactions.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Compact preview: the latest few, tap to open details. */}
      {transactions.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">
          No transactions yet. Add your first expense to get started.
        </p>
      ) : (
        <>
          {renderList(preview, false)}
          {hasMore && (
            <button
              type="button"
              onClick={openAll}
              className="mt-3 w-full rounded-xl bg-slate-50 py-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              See all {transactions.length} transactions
            </button>
          )}
        </>
      )}

      {/* Full-screen: complete searchable, selectable history. */}
      <FullScreenSheet open={showAll} onClose={closeAll} title="All transactions">
        {/* Select-mode controls */}
        <div className="mb-3 flex items-center justify-end gap-2">
          {selectMode ? (
            <>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={selected.size === 0}
                className="flex items-center gap-1 rounded-full bg-money-out px-3 py-1 text-xs font-semibold text-white transition-opacity disabled:opacity-30"
              >
                <Trash2 size={13} /> Delete
                {selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
              <button
                type="button"
                onClick={exitSelectMode}
                aria-label="Cancel selection"
                className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={15} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              Select
            </button>
          )}
        </div>

        {/* Search */}
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
          <Search size={15} className="shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, category or person…"
            className="w-full border-0 bg-transparent p-0 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            No transactions match “{search}”.
          </p>
        ) : (
          <div className="rounded-2xl bg-white p-2 ring-1 ring-slate-100">
            {renderList(filtered, true)}
          </div>
        )}
      </FullScreenSheet>

      {/* Detailed read-only view of a single transaction. */}
      <TransactionDetail
        tx={detailTx}
        open={detailTx !== null}
        onClose={() => setDetailTx(null)}
      />
    </section>
  )
}

function Row({
  tx,
  people,
  selectMode,
  selected,
  onToggleSelect,
  onOpen,
  onDelete,
  onAccept,
  onReject,
}: {
  tx: Transaction
  people: ReturnType<typeof useStore.getState>['people']
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onDelete: () => void
  onAccept: () => void
  onReject: () => void
}) {
  const isIncome = tx.type === 'income'

  // A split someone else shared with you, awaiting/needing your response.
  const isPending = tx.sharedByMe && tx.viewerStatus === 'pending'

  // Owner's view of a shared split: surface how each *linked* participant
  // responded so the person who created the split (e.g. Alice) is aware of
  // Bob's decision. We only care about participants other than "me" whose
  // response is still pending or was rejected — accepted needs no callout.
  const participantResponses =
    !tx.sharedByMe && tx.isSplit
      ? tx.shares
          .filter(
            (s) =>
              s.personId !== ME_ID &&
              (s.status === 'pending' || s.status === 'rejected'),
          )
          .map((s) => ({
            name: personName(people, s.personId),
            status: s.status as 'pending' | 'rejected',
          }))
      : []

  // Your headline figure: for both income and expense a split shows only YOUR
  // own share; a personal (non-split) entry shows the full amount.
  const displayAmount = tx.isSplit
    ? (tx.shares.find((s) => s.personId === ME_ID)?.amount ?? 0)
    : tx.amount

  const subtitle = tx.isSplit
    ? tx.sharedByMe && tx.sharedByName
      ? isIncome
        ? `Shared by ${tx.sharedByName} · you get a share`
        : `Shared by ${tx.sharedByName} · ${personName(people, tx.paidBy)} paid`
      : isIncome
        ? `You received · split ${tx.shares.length} ways`
        : `${personName(people, tx.paidBy)} paid · split ${tx.shares.length} ways`
    : tx.category

  return (
    <li
      className={`group flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg py-3 transition-colors ${
        selectMode ? 'cursor-pointer' : 'cursor-pointer hover:bg-slate-50'
      } ${selected ? 'bg-slate-50' : ''}`}
      onClick={selectMode ? onToggleSelect : onOpen}
      role="button"
      tabIndex={0}
      aria-label={
        selectMode
          ? `Toggle selection for ${tx.description}`
          : `View details for ${tx.description}`
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          selectMode ? onToggleSelect() : onOpen()
        }
      }}
    >
      {/* Selection checkbox (only in select mode) */}
      {selectMode && (
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            selected
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-transparent'
          }`}
          aria-hidden
        >
          <Check size={13} />
        </span>
      )}

      {/* Direction badge: green down-arrow for income (money in),
          red up-arrow for expenses (money out) — mirror images. */}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          isIncome ? 'bg-money-in/10 text-money-in' : 'bg-money-out/10 text-money-out'
        }`}
        title={
          isIncome
            ? 'Income'
            : tx.isSplit
              ? 'Split group bill'
              : 'Personal expense'
        }
      >
        {isIncome ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
      </span>

      {/* Description + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-sm font-medium ${
              tx.description.trim() ? 'text-slate-800' : 'italic text-slate-400'
            }`}
          >
            {txLabel(tx)}
          </p>
          {tx.isAdjustment && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Adjustment
            </span>
          )}
          {isIncome ? (
            <span className="shrink-0 rounded-full bg-money-in/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-money-in">
              Income
            </span>
          ) : (
            tx.isSplit && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Split
              </span>
            )
          )}
          {/* Shared-with-you marker + your response status. */}
          {tx.sharedByMe && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-500">
              Shared
            </span>
          )}
          {isPending && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600">
              Pending
            </span>
          )}
          {/* Owner's view: show each linked participant's response so the
              creator knows whether the other side accepted/rejected. */}
          {participantResponses.map((p) => (
            <span
              key={p.name + p.status}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                p.status === 'rejected'
                  ? 'bg-red-50 text-money-out'
                  : 'bg-amber-50 text-amber-600'
              }`}
              title={
                p.status === 'rejected'
                  ? `${p.name} rejected this split`
                  : `Waiting for ${p.name} to respond`
              }
            >
              {p.name} {p.status === 'rejected' ? 'rejected' : 'pending'}
            </span>
          ))}
        </div>
        <p className="truncate text-xs text-slate-400">
          {formatDate(tx.date)} · {subtitle}
        </p>
        {tx.attachment && (
          <a
            href={attachmentUrl(tx.attachment)}
            target="_blank"
            rel="noopener noreferrer"
            download={tx.attachmentName ?? undefined}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
            title="View attached proof"
          >
            <Paperclip size={10} className="shrink-0" />
            <span className="truncate">{tx.attachmentName ?? 'Proof'}</span>
          </a>
        )}
      </div>

      {/* Amount */}
      <div className="text-right">
        <p
          className={`text-sm font-semibold ${
            isIncome ? 'text-money-in' : 'text-money-out'
          }`}
        >
          {isIncome ? '+' : '−'}
          {formatMoney(displayAmount)}
        </p>
        {tx.isSplit && (
          <p className="text-[11px] text-slate-300">
            of {formatMoney(tx.amount)}
          </p>
        )}
      </div>

      {/* Actions (hidden in select mode; use the bulk action instead). */}
      {!selectMode &&
        (isPending ? (
          // Shared split awaiting your response: Accept / Reject your share.
          // `basis-full` pushes this cluster onto its own line (the row wraps),
          // so on narrow Android screens it never overlaps the amount/label.
          <div className="flex basis-full items-center justify-end gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAccept()
              }}
              className="flex items-center gap-1 rounded-full bg-money-in px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
              aria-label={`Accept ${tx.description}`}
            >
              <Check size={12} /> Accept
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onReject()
              }}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:text-money-out"
              aria-label={`Reject ${tx.description}`}
            >
              <X size={12} /> Reject
            </button>
          </div>
        ) : tx.sharedByMe ? (
          // Accepted shared split: you can still reject (opt out) later. No
          // delete — only the owner can delete a shared transaction.
          <button
            onClick={(e) => {
              e.stopPropagation()
              onReject()
            }}
            className="rounded-full p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-money-out sm:opacity-0 sm:group-hover:opacity-100"
            aria-label={`Reject ${tx.description}`}
            title="Reject this shared split (removes it from your history)"
          >
            <X size={15} />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="rounded-full p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-money-out sm:opacity-0 sm:group-hover:opacity-100"
            aria-label={`Delete ${tx.description}`}
          >
            <Trash2 size={15} />
          </button>
        ))}
    </li>
  )
}
