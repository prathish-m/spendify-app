import { create } from 'zustand'
import { ME_ID, type Person, type Transaction, type User } from '../types'
import { api, setToken, getToken, ApiError } from '../lib/api'

/**
 * Global app store — backed by the multi-user Postgres API.
 *
 * Auth: a JWT is kept in localStorage (via the api module). `bootstrap()`
 * checks for an existing session on load. Data actions are scoped to the
 * logged-in user server-side and always sync from the returned ledger state.
 */
interface StoreState {
  // Auth
  user: User | null
  authReady: boolean // becomes true once the initial session check completes

  // Data (the current user's ledger view)
  people: Person[]
  transactions: Transaction[]

  // Async lifecycle
  loading: boolean
  /**
   * Count of in-flight mutating actions (add/remove/adjust/link/import…).
   * A counter (not a boolean) so overlapping requests are tracked correctly:
   * the global activity indicator shows while `busy > 0`. This is distinct
   * from `loading`, which gates the full-page initial data fetch.
   */
  busy: number
  error: string | null

  // Auth actions
  bootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  /** Permanently delete the current account, then drop to the login screen. */
  deleteAccount: () => Promise<void>

  // Data loading
  load: () => Promise<void>

  // People management
  addPerson: (name: string) => Promise<void>
  /** Rename a local friend contact (linked accounts keep their real account). */
  renamePerson: (id: string, name: string) => Promise<void>
  removePerson: (id: string) => Promise<void>
  /** Link a friend contact to a real account by email. */
  linkPerson: (id: string, email: string) => Promise<void>

  // Transactions
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>
  removeTransaction: (id: string) => Promise<void>
  removeTransactions: (ids: string[]) => Promise<void>
  /** Accept or reject a split someone shared with you. */
  respondToTransaction: (
    id: string,
    status: 'accepted' | 'rejected',
  ) => Promise<void>
  /**
   * Bulk-import transactions from a backup in a single idempotent request.
   * Entries keep their original ids, so re-importing skips duplicates
   * server-side. Returns how many were imported vs skipped.
   */
  importTransactions: (
    txs: unknown[],
  ) => Promise<{ imported: number; skipped: number }>

  // Balance editing
  adjustSettlement: (
    personId: string,
    newSignedBalance: number,
  ) => Promise<void>
  adjustPersonalBalance: (newNet: number) => Promise<void>
  /**
   * Record a repayment received from a person: raises your Personal Balance by
   * `amount` AND settles that much of what they owe you (surplus flips to money
   * you owe them). The other person is not notified.
   */
  settleUp: (
    personId: string,
    amount: number,
    opts?: { date?: string; description?: string },
  ) => Promise<void>

  clearAll: () => Promise<void>
}

export const useStore = create<StoreState>()((set, get) => {
  /** Bump the in-flight action counter (drives the global activity indicator). */
  const beginBusy = () => set((s) => ({ busy: s.busy + 1 }))
  /** Release one in-flight action; never drops below zero. */
  const endBusy = () => set((s) => ({ busy: Math.max(0, s.busy - 1) }))

  /** Sync data state from a ledger response, surfacing errors + handling 401. */
  const run = async (
    fn: () => Promise<{ people: Person[]; transactions: Transaction[] }>,
  ) => {
    beginBusy()
    try {
      const state = await fn()
      set({
        people: state.people,
        transactions: state.transactions,
        error: null,
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Session expired → drop to login screen.
        setToken(null)
        set({ user: null })
      }
      set({
        error: err instanceof Error ? err.message : 'Something went wrong',
      })
      throw err
    } finally {
      endBusy()
    }
  }

  return {
    user: null,
    authReady: false,
    people: [],
    transactions: [],
    loading: false,
    busy: 0,
    error: null,

    bootstrap: async () => {
      if (!getToken()) {
        set({ authReady: true })
        return
      }
      try {
        const { user } = await api.me()
        set({ user })
        await get().load()
      } catch {
        setToken(null)
        set({ user: null })
      } finally {
        set({ authReady: true })
      }
    },

    login: async (email, password) => {
      const { token, user } = await api.login(email, password)
      setToken(token)
      set({ user, error: null })
      await get().load()
    },

    register: async (name, email, password) => {
      const { token, user } = await api.register(name, email, password)
      setToken(token)
      set({ user, error: null })
      await get().load()
    },

    logout: () => {
      setToken(null)
      set({ user: null, people: [], transactions: [], error: null })
    },

    deleteAccount: async () => {
      await api.deleteAccount()
      // Same teardown as logout — the session is now invalid server-side.
      setToken(null)
      set({ user: null, people: [], transactions: [], error: null })
    },

    load: async () => {
      set({ loading: true })
      try {
        const state = await api.getState()
        set({
          people: state.people,
          transactions: state.transactions,
          loading: false,
          error: null,
        })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setToken(null)
          set({ user: null })
        }
        set({
          loading: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not reach the server. Is the backend running?',
        })
      }
    },

    addPerson: async (name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await run(async () => (await api.addPerson(trimmed)).state)
    },

    renamePerson: async (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await run(async () => (await api.renamePerson(id, trimmed)).state)
    },

    removePerson: async (id) => {
      await run(async () => (await api.removePerson(id)).state)
    },

    // NB: linking deliberately does NOT go through `run()`. A failed link
    // (e.g. "no account with that email") should surface *inline* next to the
    // form — not trip the global connection-error banner with its Retry
    // button. We sync state ourselves on success and rethrow on failure so the
    // component's local try/catch can display the message.
    linkPerson: async (id, email) => {
      beginBusy()
      try {
        const { state } = await api.linkPerson(id, email)
        set({
          people: state.people,
          transactions: state.transactions,
          error: null,
        })
      } finally {
        endBusy()
      }
    },

    addTransaction: async (tx) => {
      await run(async () => (await api.addTransaction(tx)).state)
    },

    removeTransaction: async (id) => {
      await run(async () => (await api.removeTransaction(id)).state)
    },

    removeTransactions: async (ids) => {
      await run(async () => (await api.removeTransactions(ids)).state)
    },

    respondToTransaction: async (id, status) => {
      await run(async () => (await api.respondToTransaction(id, status)).state)
    },

    importTransactions: async (txs) => {
      set({ loading: true })
      try {
        // Single idempotent request; the server dedups by original id and
        // returns the refreshed ledger plus imported/skipped counts.
        const res = await api.importBackup(txs)
        set({
          people: res.state.people,
          transactions: res.state.transactions,
          error: null,
        })
        return { imported: res.imported, skipped: res.skipped }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setToken(null)
          set({ user: null })
        }
        set({
          error: err instanceof Error ? err.message : 'Import failed',
        })
        throw err
      } finally {
        set({ loading: false })
      }
    },

    adjustSettlement: async (personId, newSignedBalance) => {
      if (personId === ME_ID) return
      await run(
        async () =>
          (await api.adjustSettlement(personId, newSignedBalance)).state,
      )
    },

    adjustPersonalBalance: async (newNet) => {
      await run(async () => (await api.adjustPersonalBalance(newNet)).state)
    },

    settleUp: async (personId, amount, opts) => {
      if (personId === ME_ID) return
      await run(async () => (await api.settleUp(personId, amount, opts)).state)
    },

    clearAll: async () => {
      await run(async () => (await api.clearAll()).state)
    },
  }
})

/** Resolve a display name for any id, including the reserved "You" id. */
export function personName(people: Person[], id: string): string {
  if (id === ME_ID) return 'You'
  return people.find((p) => p.id === id)?.name ?? 'Unknown'
}
