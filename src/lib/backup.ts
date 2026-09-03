import type { Person, Transaction } from '../types'
import { api } from './api'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Backup import/export helpers.
 *
 * A backup captures the current user's own transactions (with full metadata,
 * including their original ids + createdAt) plus a snapshot of their people
 * for readable name context. Import is IDEMPOTENT: because each transaction
 * keeps its original id, re-importing the same file skips anything already
 * present instead of creating duplicates (dedup happens server-side via the
 * primary key).
 */

// v3 adds `attachmentData` (base64 receipt bytes) so backups are SELF-CONTAINED
// and restore attachments into any account/database. v2 files (URL-only
// attachments) still import fine — the extra field is simply absent.
export const BACKUP_VERSION = 3 as const

/** A backed-up transaction, optionally carrying its receipt bytes inline. */
export type BackupTx = Transaction & {
  /** Base64-encoded attachment bytes (no data: prefix). Present in v3+. */
  attachmentData?: string | null
  /** MIME type of the embedded bytes, used to reconstruct the file on import. */
  attachmentMime?: string | null
}

export interface BackupFile {
  app: 'spendify'
  version: number
  exportedAt: string
  people: Pick<Person, 'id' | 'name'>[]
  transactions: BackupTx[]
}

/**
 * The shape sent to the import endpoint. We keep `id` + `createdAt` (needed for
 * dedup and to preserve ordering) but drop viewer-only presentation fields the
 * server recomputes (sharedByMe / sharedByName / ownerId / viewerStatus).
 */
export type ImportableTx = Omit<
  Transaction,
  'sharedByMe' | 'sharedByName' | 'ownerId' | 'viewerStatus'
>

/**
 * Build a SELF-CONTAINED backup for the given ledger view. For every owned
 * transaction that has an attachment, the receipt bytes are fetched and embedded
 * as base64 (`attachmentData` + `attachmentMime`) so the export can be restored
 * into any account/database. Async because it fetches attachment bytes.
 *
 * A single attachment that fails to download does not abort the whole export:
 * that transaction is still included, just without its embedded bytes (the URL
 * is kept, which only resolves in the original account).
 */
export async function buildBackup(
  people: Person[],
  transactions: Transaction[],
): Promise<BackupFile> {
  // Only export transactions you own — not splits shared *with* you (those
  // belong to their owner and re-importing would duplicate them).
  const owned = transactions.filter((t) => !t.sharedByMe)

  const withBytes: BackupTx[] = await Promise.all(
    owned.map(async (t): Promise<BackupTx> => {
      if (!t.attachment) return { ...t }
      try {
        const { base64, mime } = await api.fetchAttachmentBase64(t.attachment)
        return { ...t, attachmentData: base64, attachmentMime: mime }
      } catch {
        // Couldn't fetch — keep the transaction, drop the embedded bytes.
        return { ...t }
      }
    }),
  )

  return {
    app: 'spendify',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    people: people.map((p) => ({ id: p.id, name: p.name })),
    transactions: withBytes,
  }
}

/**
 * Serialize + save/share the backup JSON.
 *
 * On the web this triggers a normal browser download. Inside the Android
 * (Capacitor) WebView the `<a download>` trick does nothing, so we instead
 * write the file to the app's Documents directory with the Filesystem plugin
 * and then open the native share sheet so the user can save it to Files /
 * Drive / send it anywhere. Returns a promise so callers can await + surface
 * errors.
 */
export async function downloadBackup(backup: BackupFile): Promise<void> {
  const json = JSON.stringify(backup, null, 2)
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `spendify-backup-${stamp}.json`

  if (Capacitor.isNativePlatform()) {
    // Write into the app-scoped Documents dir (no runtime storage permission
    // needed), then hand the file URI to the OS share sheet.
    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    await Share.share({
      title: 'Spendify backup',
      text: filename,
      url: written.uri,
      dialogTitle: 'Save or share your backup',
    })
    return
  }

  // Web fallback: classic anchor download.
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Parse + validate a backup file's text. Throws a friendly Error when the
 * shape is wrong so the caller can surface it.
 */
export function parseBackup(text: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (
    !data ||
    typeof data !== 'object' ||
    (data as BackupFile).app !== 'spendify' ||
    !Array.isArray((data as BackupFile).transactions)
  ) {
    throw new Error('This does not look like a Spendify backup file.')
  }
  return data as BackupFile
}

/**
 * Normalize a backed-up transaction into the shape `addTransaction` expects,
 * dropping server-managed fields. Amounts/shares are kept as-is.
 *
 * Note: split participants are referenced by their friend id in the backup.
 * Those ids are only valid for the account that exported them, so importing
 * into a *different* account keeps personal (non-split) entries intact and
 * degrades unmatched split participants gracefully via the existing server
 * fallback (unknown refs resolve to "me").
 */
export function toImportable(tx: Transaction): ImportableTx {
  const shares = tx.isSplit
    ? tx.shares.map((s) => ({
        // Participant ids are passed through verbatim. "me" and still-known
        // friend ids resolve correctly server-side; any unknown ref falls back
        // safely to the importing user (see server resolveRefForStorage).
        personId: s.personId,
        amount: s.amount,
        status: s.status,
      }))
    : []

  return {
    // Preserved so the server can dedup on re-import.
    id: tx.id,
    createdAt: tx.createdAt,
    description: tx.description,
    amount: tx.amount,
    type: tx.type ?? 'expense',
    category: tx.category,
    date: tx.date,
    isSplit: tx.isSplit,
    paidBy: tx.paidBy,
    shares,
    isAdjustment: tx.isAdjustment ?? false,
    attachment: tx.attachment ?? null,
    attachmentName: tx.attachmentName ?? null,
  }
}

/**
 * Prepare a backed-up transaction for import into the CURRENT account.
 *
 * When the backup embedded the receipt bytes (`attachmentData`, v3+), those
 * bytes are re-uploaded here so the restored transaction points at a fresh
 * `/api/uploads/<id>` URL that is valid in this account/database. If there are
 * no embedded bytes (older v2 backup, or the export couldn't fetch them), the
 * original URL is kept as-is — it only resolves in the source account, matching
 * the previous behavior.
 */
export async function toImportableWithAttachment(
  tx: BackupTx,
): Promise<ImportableTx> {
  const base = toImportable(tx)
  if (tx.attachmentData) {
    try {
      const { url, name } = await api.uploadAttachmentBase64(
        tx.attachmentData,
        tx.attachmentName || 'receipt',
        tx.attachmentMime || undefined,
      )
      return { ...base, attachment: url, attachmentName: name }
    } catch {
      // Re-upload failed — fall back to the original (possibly dangling) URL.
      return base
    }
  }
  return base
}
