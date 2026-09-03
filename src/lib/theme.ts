import { create } from 'zustand'

/**
 * Theme (light/dark) store.
 *
 * The choice is persisted in localStorage and applied by toggling a `dark`
 * class on <html> (see index.css for the class-based dark variant + overrides).
 * On first visit we fall back to the OS preference.
 */
export type Theme = 'light' | 'dark'

const KEY = 'spendify-theme'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  // Fall back to the OS setting when unset.
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }
  return 'light'
}

/** Reflect the theme onto <html> so the CSS overrides kick in. */
function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
}

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setTheme: (t) => {
    apply(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* ignore */
    }
    set({ theme: t })
  },
}))

/**
 * Apply the persisted/OS theme as early as possible (call once at module load
 * from main.tsx) to avoid a flash of the wrong theme before React mounts.
 */
export function initThemeClass() {
  apply(initialTheme())
}
