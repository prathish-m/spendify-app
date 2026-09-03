/**
 * Shared domain types for the expense splitter.
 *
 * Conventions:
 *  - "You" (the app owner) is represented by the reserved id `ME_ID`.
 *  - All monetary amounts are stored as plain numbers in a single currency.
 */

/** Reserved identifier for the app owner ("You"). */
export const ME_ID = 'me' as const

/** A person you split expenses with (friends, roommates, etc.). */
export interface Person {
  id: string
  name: string
  /** If linked to a real account, that user's id. */
  linkedUserId?: string | null
  /** The linked account's email (for display). */
  linkedEmail?: string | null
  /** 'none' | 'pending' | 'accepted'. */
  linkStatus?: string
}

/** An authenticated user account. */
export interface User {
  id: string
  email: string
  name: string
}

/** Expense categories used for light-weight tagging. */
export type Category =
  | 'General'
  | 'Food'
  | 'Groceries'
  | 'Transport'
  | 'Rent'
  | 'Utilities'
  | 'Entertainment'
  | 'Travel'
  | 'Health'
  | 'Shopping'
  | 'Adjustment'

/**
 * Categories offered in the manual entry form.
 * 'Adjustment' is intentionally excluded here — those entries are created
 * automatically when a balance is edited, not picked by the user.
 */
export const CATEGORIES: Category[] = [
  'General',
  'Food',
  'Groceries',
  'Transport',
  'Rent',
  'Utilities',
  'Entertainment',
  'Travel',
  'Health',
  'Shopping',
]

/**
 * Direction of money movement:
 *  - 'expense' → money OUT (a debit), the default.
 *  - 'income'  → money IN  (a credit): salary, refund, gift, reimbursement…
 * Income entries are always personal (not split).
 */
export type TxType = 'expense' | 'income'

/** A participant's response to a shared split. */
export type ShareStatus = 'accepted' | 'pending' | 'rejected'

/** How much a single participant owes for a given transaction. */
export interface SplitShare {
  /** Person id (may be ME_ID). */
  personId: string
  /** The portion of the total this person is responsible for. */
  amount: number
  /**
   * This participant's accept/reject state. Defaults to 'accepted' for the
   * owner's own share and for local (unlinked) friends. Optional for
   * backward-compatibility.
   */
  status?: ShareStatus
}

/**
 * A transaction is either:
 *  - a personal expense (`isSplit === false`), fully owed by you, or
 *  - a split group bill (`isSplit === true`) where `paidBy` covered the total
 *    and `shares` describes each participant's responsibility.
 */
export interface Transaction {
  id: string
  description: string
  amount: number
  /**
   * Whether this is money out ('expense') or money in ('income').
   * Optional in the type for backward-compatibility with data persisted
   * before this field existed; treated as 'expense' when absent.
   */
  type?: TxType
  category: Category
  /** ISO date string (YYYY-MM-DD). */
  date: string
  isSplit: boolean
  /** Who paid the bill. Defaults to ME_ID for personal expenses. */
  paidBy: string
  /** Present only when isSplit === true. */
  shares: SplitShare[]
  /**
   * Optional "proof" attachment, stored inline as a base64 data URL
   * (e.g. a receipt photo). Null/absent when nothing was attached.
   */
  attachment?: string | null
  /** Original filename of the attachment, for display/download. */
  attachmentName?: string | null
  /**
   * Marks entries auto-created by editing a balance (a manual correction),
   * so the UI can label them distinctly. Optional for backward-compatibility.
   */
  isAdjustment?: boolean
  /** Creation timestamp used for stable ordering. */
  createdAt: number
  /** Id of the account that created/owns this transaction (server-provided). */
  ownerId?: string
  /**
   * True when this split was created by *someone else* and shared with you
   * (you are a linked participant, not the owner).
   */
  sharedByMe?: boolean
  /** Display name of the account that shared this split with you (if any). */
  sharedByName?: string | null
  /**
   * Your own response to a shared split: 'accepted' | 'pending' | 'rejected'.
   * Only meaningful when `sharedByMe` is true.
   */
  viewerStatus?: ShareStatus
}

/** An optional per-category spend cap inside a budget. */
export interface BudgetCategoryLimit {
  id: string
  category: string
  amount: number
}

/**
 * A spending budget: a single overall cap over an inclusive date range,
 * with zero or more optional per-category limits. Budget ranges never
 * overlap (enforced server-side).
 */
export interface Budget {
  id: string
  /** Inclusive ISO start date (YYYY-MM-DD). */
  startDate: string
  /** Inclusive ISO end date (YYYY-MM-DD). */
  endDate: string
  /** Overall spend cap for the whole range. */
  amount: number
  /** Creation timestamp (server-provided). */
  createdAt: number
  categoryLimits: BudgetCategoryLimit[]
}

/**
 * A simplified, directional debt: `from` owes `to` `amount`.
 * Produced by the settlement engine.
 */
export interface Settlement {
  from: string
  to: string
  amount: number
}
