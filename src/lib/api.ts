import type { Budget, Person, Transaction, User } from '../types'

/**
 * API client for the Node.js + Postgres backend.
 *
 * Base URL uses the Vite dev proxy (`/api`) by default, or an explicit
 * `VITE_API_URL`. A JWT (persisted in localStorage) is attached as a Bearer
 * token to every request once the user logs in.
 */
const API_ORIGIN = import.meta.env.VITE_API_URL ?? ''
const BASE = API_ORIGIN + '/api'
const TOKEN_KEY = 'expense-splitter-token'

/**
 * Resolve a stored attachment URL (relative `/api/uploads/...`) into a fully
 * loadable URL, honoring an explicit `VITE_API_URL` backend origin.
 */
export function attachmentUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return API_ORIGIN + path
}

let token: string | null = localStorage.getItem(TOKEN_KEY)

export function setToken(next: string | null) {
  token = next
  if (next) localStorage.setItem(TOKEN_KEY, next)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getToken() {
  return token
}

/** The authoritative ledger state returned by mutating endpoints. */
export interface AppState {
  people: Person[]
  transactions: Transaction[]
  /**
   * Spending budgets (Android-only feature). Optional so the type stays
   * compatible with any state payload that predates the feature.
   */
  budgets?: Budget[]
}

/** Payload for creating a budget. */
export interface NewBudget {
  startDate: string
  endDate: string
  amount: number
  categoryLimits?: { category: string; amount: number }[]
}

/** Thrown for non-2xx responses; carries the HTTP status. */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status)
  }
  return res.json() as Promise<T>
}

export const api = {
  // ── Auth ──
  register: (name: string, email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ user: User }>('/auth/me'),

  // ── State ──
  getState: () => request<AppState>('/state'),

  // ── People / friends ──
  addPerson: (name: string) =>
    request<{ person: Person; state: AppState }>('/people', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  renamePerson: (id: string, name: string) =>
    request<{ state: AppState }>(`/people/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  removePerson: (id: string) =>
    request<{ state: AppState }>(`/people/${id}`, { method: 'DELETE' }),

  linkPerson: (id: string, email: string) =>
    request<{ state: AppState }>(`/people/${id}/link`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  /**
   * Record money a person repaid you (settle up). Raises your Personal Balance
   * by `amount` AND reduces what that person owes you by the same amount. If the
   * amount exceeds their debt, the surplus becomes money you owe them. The other
   * person is NOT notified — it's a purely local adjustment.
   */
  settleUp: (
    personId: string,
    amount: number,
    opts?: { date?: string; description?: string },
  ) =>
    request<{ state: AppState }>('/settle-up', {
      method: 'POST',
      body: JSON.stringify({ personId, amount, ...opts }),
    }),

  // ── Budgets ──
  /** Create a budget. Server rejects overlapping ranges with a 409. */
  addBudget: (budget: NewBudget) =>
    request<{ state: AppState }>('/budgets', {
      method: 'POST',
      body: JSON.stringify(budget),
    }),

  /** Edit a budget. Server rejects overlapping ranges (excluding itself) 409. */
  updateBudget: (id: string, budget: NewBudget) =>
    request<{ state: AppState }>(`/budgets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(budget),
    }),

  removeBudget: (id: string) =>
    request<{ state: AppState }>(`/budgets/${id}`, { method: 'DELETE' }),

  // ── Transactions ──
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) =>
    request<{ state: AppState }>('/transactions', {
      method: 'POST',
      body: JSON.stringify(tx),
    }),

  removeTransaction: (id: string) =>
    request<{ state: AppState }>(`/transactions/${id}`, { method: 'DELETE' }),

  /** Accept or reject a split someone shared with you. */
  respondToTransaction: (id: string, status: 'accepted' | 'rejected') =>
    request<{ state: AppState }>(`/transactions/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  removeTransactions: (ids: string[]) =>
    request<{ state: AppState }>('/transactions/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  /**
   * Import a backup. Idempotent: transactions keep their original ids, so the
   * server skips any that already exist. Returns how many were imported vs
   * skipped, plus the refreshed state.
   */
  importBackup: (transactions: unknown[]) =>
    request<{ imported: number; skipped: number; state: AppState }>(
      '/import',
      {
        method: 'POST',
        body: JSON.stringify({ transactions }),
      },
    ),

  // ── Balance adjustments ──
  adjustSettlement: (personId: string, newSignedBalance: number) =>
    request<{ state: AppState }>('/adjust-settlement', {
      method: 'POST',
      body: JSON.stringify({ personId, newSignedBalance }),
    }),

  adjustPersonalBalance: (newNet: number) =>
    request<{ state: AppState }>('/adjust-personal', {
      method: 'POST',
      body: JSON.stringify({ newNet }),
    }),

  clearAll: () => request<{ state: AppState }>('/clear', { method: 'POST' }),

  /** Permanently delete the caller's account (see server for unlink semantics). */
  deleteAccount: () =>
    request<{ ok: boolean }>('/account', { method: 'DELETE' }),

  /**
   * Upload a proof attachment. Sends the raw file bytes with the original
   * name in `X-File-Name`; returns the stored relative URL + name.
   */
  uploadAttachment: async (file: File) => {
    const res = await fetch(BASE + '/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    })
    if (!res.ok) {
      let message = `Upload failed (${res.status})`
      try {
        const body = await res.json()
        if (body?.error) message = body.error
      } catch {
        /* ignore */
      }
      throw new ApiError(message, res.status)
    }
    return res.json() as Promise<{ url: string; name: string }>
  },

  /**
   * Fetch a stored attachment's raw bytes and return them base64-encoded along
   * with the MIME type + filename. Used when building a *self-contained* backup
   * so the exported JSON carries the actual receipt, not just a URL that only
   * resolves against the exporting account's database.
   */
  fetchAttachmentBase64: async (
    url: string,
  ): Promise<{ base64: string; mime: string; name: string | null }> => {
    const res = await fetch(attachmentUrl(url), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new ApiError(`Attachment fetch failed (${res.status})`, res.status)
    const blob = await res.blob()
    const base64 = await blobToBase64(blob)
    // Derive a filename from the Content-Disposition header when present.
    let name: string | null = null
    const cd = res.headers.get('content-disposition')
    const m = cd && /filename="?([^"]+)"?/i.exec(cd)
    if (m) {
      try {
        name = decodeURIComponent(m[1])
      } catch {
        name = m[1]
      }
    }
    return { base64, mime: blob.type || 'application/octet-stream', name }
  },

  /**
   * Re-upload attachment bytes provided as base64 (from a self-contained
   * backup) into the current account, returning the fresh stored URL. Reuses
   * the raw upload endpoint by reconstructing a File from the bytes.
   */
  uploadAttachmentBase64: async (
    base64: string,
    name: string,
    mime?: string,
  ): Promise<{ url: string; name: string }> => {
    const bytes = base64ToBytes(base64)
    // Wrap in a Blob first (BlobPart accepts ArrayBuffer) to sidestep the DOM
    // lib's strict ArrayBuffer-vs-ArrayBufferLike typing on the File ctor.
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: mime || 'application/octet-stream',
    })
    const file = new File([blob], name || 'upload', {
      type: mime || 'application/octet-stream',
    })
    return api.uploadAttachment(file)
  },
}

/** Read a Blob into a bare base64 string (no data: URL prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read attachment'))
    reader.onload = () => {
      const result = String(reader.result || '')
      // Strip the "data:<mime>;base64," prefix.
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

/** Decode a bare base64 string into a Uint8Array. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
