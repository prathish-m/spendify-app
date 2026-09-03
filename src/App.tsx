import { useEffect, useRef, useState } from 'react'
import {
  Plus,
  Wallet,
  Loader2,
  WifiOff,
  LogOut,
  Trash2,
  Sun,
  Moon,
  Download,
  Upload,
  Menu,
} from 'lucide-react'
import { Dashboard, Settlements } from './components/Dashboard'
import { Analytics } from './components/Analytics'
import { PeopleManager } from './components/PeopleManager'
import { TransactionForm } from './components/TransactionForm'
import { TransactionHistory } from './components/TransactionHistory'
import { BudgetManager } from './components/BudgetManager'
import { AuthScreen } from './components/AuthScreen'
import { ConfirmDialog, useConfirm } from './components/ui/ConfirmDialog'
import { GlobalBusy } from './components/ui/GlobalBusy'
import { SideDrawer, DrawerItem } from './components/ui/SideDrawer'
import { BottomNav } from './components/ui/BottomNav'
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
type Page = 'dashboard' | 'home' | 'budgets'

export default function App() {
  const [formOpen, setFormOpen] = useState(false)
  // Left slide-out menu holding export/import/theme/delete/logout actions.
  const [drawerOpen, setDrawerOpen] = useState(false)
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
    try {
      await downloadBackup(await buildBackup(people, transactions))
    } catch (err) {
      // Native save/share can be cancelled by the user or fail on device;
      // surface anything unexpected rather than failing silently.
      const message = err instanceof Error ? err.message : String(err)
      if (/cancel/i.test(message)) return // user dismissed the share sheet
      await confirm({
        title: 'Export failed',
        message,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        destructive: false,
      })
    }
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
          {/* Menu button opens the left slide-out drawer */}
          <button
            onClick={() => setDrawerOpen(true)}
            title="Menu"
            aria-label="Open menu"
            className="-ml-1 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            <Menu size={20} />
          </button>

          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Wallet size={16} />
          </span>
          <h1 className="text-base font-semibold tracking-tight text-slate-900">
            Spendify
          </h1>
          <span className="hidden text-xs text-slate-400 sm:inline">
            {user.name}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Desktop add button */}
            <button
              onClick={() => setFormOpen(true)}
              className="hidden items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 sm:flex"
            >
              <Plus size={15} /> Add Expense
            </button>
          </div>

          {/* Hidden file input reused by the drawer's Import action */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onFilePicked}
          />
        </div>
      </header>

      {/* Left slide-out menu: import / export / theme / delete / logout */}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Menu"
      >
        <DrawerItem
          icon={<Download size={18} />}
          label="Export backup"
          disabled={transactions.length === 0}
          onClick={() => {
            setDrawerOpen(false)
            void handleExport()
          }}
        />
        <DrawerItem
          icon={<Upload size={18} />}
          label="Import backup"
          onClick={() => {
            setDrawerOpen(false)
            fileInputRef.current?.click()
          }}
        />
        <DrawerItem
          icon={theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={toggleTheme}
        />
        <DrawerItem
          icon={<Trash2 size={18} />}
          label="Delete account"
          destructive
          onClick={() => {
            setDrawerOpen(false)
            void handleDeleteAccount()
          }}
        />
        <DrawerItem
          icon={<LogOut size={18} />}
          label="Sign out"
          onClick={() => {
            setDrawerOpen(false)
            void handleLogout()
          }}
        />
      </SideDrawer>

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
      <main
        className="mx-auto max-w-5xl px-5 py-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 7rem)' }}
      >
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
        ) : page === 'budgets' ? (
          /* Budgets page: create/manage spending budgets. */
          <BudgetManager />
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

      {/* Floating add button (mobile). Raised above the bottom nav so the two
          floating controls never overlap; safe-area inset keeps it clear of the
          Android gesture bar. */}
      <button
        onClick={() => setFormOpen(true)}
        className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-transform active:scale-95 sm:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
        aria-label="Add expense"
      >
        <Plus size={24} />
      </button>

      {/* Floating bottom navigation (Dashboard / Home) */}
      <BottomNav page={page} onChange={setPage} />

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} />

      {/* Global confirmation dialog (delete actions, etc.) */}
      <ConfirmDialog />

      {/* Global activity indicator: top progress bar + "Saving…" pill while
          any mutating action is in flight, so the user gets feedback. */}
      <GlobalBusy />
    </div>
  )
}
