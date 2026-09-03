import { LayoutDashboard, Home } from 'lucide-react'

type Page = 'dashboard' | 'home'

interface BottomNavProps {
  page: Page
  onChange: (page: Page) => void
}

const tabs: { key: Page; label: string; icon: typeof Home }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'home', label: 'Home', icon: Home },
]

/**
 * Floating bottom navigation (Dashboard / Home) with a glassy look.
 *
 * Fixed to the bottom, detached from the screen edges (rounded pill with
 * margins + shadow), using a translucent background + `backdrop-blur` for the
 * frosted-glass effect. Respects the Android gesture-bar safe area.
 */
export function BottomNav({ page, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-5"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
    >
      <div className="flex items-center gap-1 rounded-full border border-white/40 bg-white/70 p-1.5 shadow-lg shadow-slate-900/10 ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60">
        {tabs.map(({ key, label, icon: Icon }) => {
          const active = page === key
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
