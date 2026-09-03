import { useEffect, useRef, useState } from 'react'
import {
  Plus,
  Wallet,
  Loader2,
  WifiOff,
  LogOut,
  LayoutDashboard,
  Home,
  Trash2,
  Sun,
  Moon,
  Download,
  Upload,
} from 'lucide-react'
import { Dashboard, Settlements } from './components/Dashboard'
import { Analytics } from './components/Analytics'
import { PeopleManager } from './components/PeopleManager'
import { TransactionForm } from './components/TransactionForm'
import { TransactionHistory } from './components/TransactionHistory'
import { AuthScreen } from './components/AuthScreen'
import { ConfirmDialog, useConfirm } from './components/ui/ConfirmDialog'
import { GlobalBusy } from './components/ui/GlobalBusy'
import { useStore } from './store/useStore'
import { useTheme } from './lib/theme'
import {
  buildBackup,
  downloadBackup,
  parseBackup,
  toImportableWithAttachment,
} from './lib/backup'

/**
 * App shell / layout.
 *
 * Auth-gated: bootstraps the session on mount, shows the login/register screen
 * when signed out, and the dashboard when signed in. Data comes from the
 * multi-user Postgres backend, scoped to the logged-in account.
 */
type Page = 'dashboard' | 'home'

export default function App() {
  const [formOpen, setFormOpen] = useState(false)
  // Which page is showing. Dashboard = balance cards + analytics charts.
  // Home = settlements, transaction history and people.
  const [page, setPage] = useState<Page>('dashboard')
  const bootstrap = useStore((s) => s.bootstrap)
  const authReady = useStore((s) => s.authReady)
  const user = useStore((s) => s.user)
  const logout = useStore((s) => s.logout)
  const deleteAccount = useStore((s) => s.deleteAccount)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const load = useStore((s) => s.load)
  const people = useStore((s) => s.people)
  const transactions = useStore((s) => s.transactions)
  const importTransactions = useStore((s) => s.importTransactions)
  const confirm = useConfirm()
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggle)

  // Hidden <input type="file"> used to pick a backup for import.
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Logout with a confirmation step so it isn't triggered accidentally.
  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to access your account.',
      confirmLabel: 'Sign out',
      destructive: false,
    })
    if (ok) logout()
  }

  // Export the current user's ledger as a downloadable JSON backup. Attachment
  // bytes are fetched + embedded so the backup is self-contained (async).
  const handleExport = async () => {
    if (transactions.length === 0) return
    downloadBackup(await buildBackup(people, transactions))
  }

  // Import: parse the chosen file, confirm, then bulk re-create the entries.
  const handleImportFile = async (file: File) => {
    let backup
    try {
      backup = parseBackup(await file.text())
    } catch (err) {
      await confirm({
        title: 'Could not read backup',
        message: err instanceof Error ? err.message : 'Invalid file.',
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        destructive: false,
      })
      return
    }

    const count = backup.transactions.length
    if (count === 0) {
      await confirm({
        title: 'Nothing to import',
        message: 'This backup contains no transactions.',
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        destructive: false,
      })
      return
    }

    const ok = await confirm({
      title: `Import ${count} transaction${count === 1 ? '' : 's'}?`,
      message:
        'Entries already present are skipped, so importing the same backup twice is safe (no duplicates). New entries are merged into your current data.',
      confirmLabel: 'Import',
      destructive: false,
    })
    if (!ok) return

    try {
      // Re-upload any embedded attachment bytes into this account first, so the
      // restored transactions reference valid URLs (self-contained v3 backups).
      const importable = await Promise.all(
        backup.transactions.map((t) => toImportableWithAttachment(t)),
      )
      const { imported, skipped } = await importTransactions(importable)
      await confirm({
        title: 'Import complete',
        message:
          `Imported ${imported} new transaction${imported === 1 ? '' : 's'}.` +
          (skipped > 0
            ? ` Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'} already in your account.`
            : ''),
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        destructive: false,
      })
    } catch {
      /* error surfaces via the store banner */
    }
  }

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again still fires onChange.
    e.target.value = ''
    if (file) void handleImportFile(file)
  }

  // Delete-account flow: confirm, then permanently remove the account. Anyone
  // linked to this user keeps their contact + history (server unlinks them).
  const handleDeleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      message:
        'This permanently deletes your account and your data. Anyone linked to you will be unlinked but keep their own history. This cannot be undone.',
      confirmLabel: 'Delete account',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteAccount()
    } catch {
      /* error surfaces via the store banner */
    }
  }

  // Check for an existing session once, on mount.
  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // While we don't yet know if there's a session, show a neutral splash.
  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-300">
        <Loader2 size={22} className="animate-spin" />
      </div>
    )
  }

  // Signed out → login / register.
  if (!user) return <AuthScreen />

  // Signed in → the app.
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-neutral-50/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Wallet size={16} />
          </span>
          <h1 className="text-base font-semibold tracking-tight text-slate-900">
            Spendify
          </h1>
          <span className="hidden text-xs text-slate-400 sm:inline">
            {user.name}
          </span>

          {/* Page navigation */}
          <nav className="ml-4 flex items-center gap-1 rounded-full bg-slate-100 p-1">
            <button
              onClick={() => setPage('dashboard')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                page === 'dashboard'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutDashboard size={14} />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => setPage('home')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                page === 'home'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Home size={14} />
              <span className="hidden sm:inline">Home</span>
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Desktop add button */}
            <button
              onClick={() => setFormOpen(true)}
              className="hidden items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 sm:flex"
            >
              <Plus size={15} /> Add Expense
            </button>
            <button
              onClick={handleExport}
              disabled={transactions.length === 0}
              title="Export backup"
              aria-label="Export backup"
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import backup"
              aria-label="Import backup"
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <Upload size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onFilePicked}
            />
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              aria-label="Toggle theme"
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={handleDeleteAccount}
              title="Delete account"
              aria-label="Delete account"
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-money-out"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Connection error banner */}
      {error && (
        <div className="mx-auto mt-4 flex max-w-5xl items-center gap-2 rounded-xl bg-money-out/10 px-4 py-3 text-xs font-medium text-money-out">
          <WifiOff size={14} />
          <span>{error}</span>
          <button
            onClick={() => load()}
            className="ml-auto rounded-full bg-money-out px-3 py-1 text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      <main className="mx-auto max-w-5xl px-5 py-6 pb-28 sm:pb-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-xs">Loading your data…</span>
          </div>
        ) : page === 'dashboard' ? (
          /* Dashboard page: balance cards + analytics charts. */
          <div className="space-y-6">
            <Dashboard />
            <Analytics />
          </div>
        ) : (
          /* Home page: settlements, transaction history and people. */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
            {/* Primary column */}
            <div className="space-y-6">
              <Settlements />
              <TransactionHistory />
            </div>

            {/* Secondary column */}
            <aside className="space-y-6">
              <PeopleManager />
            </aside>
          </div>
        )}
      </main>

      {/* Floating add button (mobile) */}
      <button
        onClick={() => setFormOpen(true)}
        className="fixed right-5 bottom-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-transform active:scale-95 sm:hidden"
        aria-label="Add expense"
      >
        <Plus size={24} />
      </button>

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} />

      {/* Global confirmation dialog (delete actions, etc.) */}
      <ConfirmDialog />

      {/* Global activity indicator: top progress bar + "Saving…" pill while
          any mutating action is in flight, so the user gets feedback. */}
      <GlobalBusy />
    </div>
  )
}
