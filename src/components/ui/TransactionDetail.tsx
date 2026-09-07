import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Paperclip,
  Pencil,
  Tag,
  User,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { useStore, personName } from '../../store/useStore'
import { attachmentUrl } from '../../lib/api'
import { ME_ID, type Transaction, type ShareStatus } from '../../types'
import { formatDate, formatMoney } from '../../lib/format'

/**
 * Read-only detailed view of a single transaction, shown in a modal.
 *
 * Surfaces everything the compact history row hides: the full amount, the
 * category, who paid, and — for split bills — every participant's share and
 * their accept/reject status. Purely presentational; no mutations here.
 */
export function TransactionDetail({
  tx,
  open,
  onClose,
  onEdit,
}: {
  tx: Transaction | null
  open: boolean
  onClose: () => void
  /** Called when the user taps Edit. Omit/absent → no edit affordance. */
  onEdit?: (tx: Transaction) => void
}) {
  const people = useStore((s) => s.people)
  if (!tx) return null

  const isIncome = tx.type === 'income'
  // A settle-up ("Repayment") is a special adjustment the user DID create and
  // may want to correct (amount/date/description). It routes through the same
  // onEdit callback; the parent opens the lightweight settlement editor for it.
  const isSettleUp = tx.isAdjustment && tx.category === 'Repayment'
  // You can only edit entries you OWN: not a split shared TO you, and not a
  // system-generated adjustment/settlement movement — EXCEPT settle-ups, which
  // are editable via the dedicated flow above.
  const canEdit =
    Boolean(onEdit) && !tx.sharedByMe && (!tx.isAdjustment || isSettleUp)
  const myShare = tx.isSplit
    ? tx.shares.find((s) => s.personId === ME_ID)?.amount ?? 0
    : tx.amount

  return (
    <Modal open={open} onClose={onClose} title="Transaction details">
      {/* Headline: icon + description + amount */}
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            isIncome
              ? 'bg-money-in/10 text-money-in'
              : 'bg-money-out/10 text-money-out'
          }`}
        >
          {isIncome ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-900">
            {tx.description.trim() || tx.category || 'Untitled'}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone="neutral">{isIncome ? 'Income' : 'Expense'}</Badge>
            {tx.isSplit && <Badge tone="neutral">Split</Badge>}
            {tx.isAdjustment && <Badge tone="neutral">Adjustment</Badge>}
            {tx.sharedByMe && <Badge tone="indigo">Shared with you</Badge>}
          </div>
        </div>
        <p
          className={`shrink-0 text-lg font-semibold ${
            isIncome ? 'text-money-in' : 'text-money-out'
          }`}
        >
          {isIncome ? '+' : '−'}
          {formatMoney(tx.amount)}
        </p>
      </div>

      {/* Meta grid */}
      <dl className="mt-5 space-y-3">
        <MetaRow icon={<Calendar size={15} />} label="Date">
          {formatDate(tx.date)}
        </MetaRow>
        <MetaRow icon={<Tag size={15} />} label="Category">
          {tx.category}
        </MetaRow>
        <MetaRow
          icon={<User size={15} />}
          label={isIncome ? 'Received by' : 'Paid by'}
        >
          {personName(people, tx.paidBy)}
          {tx.sharedByMe && tx.sharedByName
            ? ` · shared by ${tx.sharedByName}`
            : ''}
        </MetaRow>
        {tx.sharedByMe && tx.viewerStatus && (
          <MetaRow icon={<User size={15} />} label="Your response">
            <StatusPill status={tx.viewerStatus} />
          </MetaRow>
        )}
      </dl>

      {/* Split breakdown */}
      {tx.isSplit && tx.shares.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Split breakdown
          </p>
          {isIncome && (
            <p className="mb-2 text-[11px] text-slate-400">
              You received this and owe each person below their share.
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-xl bg-slate-50 px-3">
            {tx.shares.map((s) => {
              const isMe = s.personId === ME_ID
              return (
                <li
                  key={s.personId}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm text-slate-700">
                      {isMe ? 'You' : personName(people, s.personId)}
                    </span>
                    {s.status && s.status !== 'accepted' && (
                      <StatusPill status={s.status} />
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-slate-900">
                    {formatMoney(s.amount)}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between px-3 text-xs text-slate-500">
            <span>Your share</span>
            <span className="font-semibold text-slate-700">
              {formatMoney(myShare)}
            </span>
          </div>
        </div>
      )}

      {/* Attachment */}
      {tx.attachment && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Attachment
          </p>
          <a
            href={attachmentUrl(tx.attachment)}
            target="_blank"
            rel="noopener noreferrer"
            download={tx.attachmentName ?? undefined}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-800"
          >
            <Paperclip size={14} className="shrink-0" />
            <span className="truncate">{tx.attachmentName ?? 'Proof'}</span>
          </a>
        </div>
      )}

      {/* Edit action — only for transactions you own (see canEdit above). */}
      {canEdit && (
        <button
          type="button"
          onClick={() => onEdit?.(tx)}
          className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-slate-900 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Pencil size={15} /> Edit transaction
        </button>
      )}
    </Modal>
  )
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-sm text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="text-right text-sm font-medium text-slate-800">
        {children}
      </dd>
    </div>
  )
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'neutral' | 'indigo'
}) {
  const cls =
    tone === 'indigo'
      ? 'bg-indigo-50 text-indigo-500'
      : 'bg-slate-100 text-slate-500'
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  )
}

function StatusPill({ status }: { status: ShareStatus }) {
  const map: Record<ShareStatus, string> = {
    accepted: 'bg-money-in/10 text-money-in',
    pending: 'bg-amber-50 text-amber-600',
    rejected: 'bg-red-50 text-money-out',
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${map[status]}`}
    >
      {status}
    </span>
  )
}
