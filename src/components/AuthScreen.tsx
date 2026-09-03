import { useState } from 'react'
import { Wallet, Loader2, Sun, Moon } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useTheme } from '../lib/theme'
import { Field, inputClass } from './ui/Field'

/**
 * Login / Register screen. Shown whenever there is no authenticated user.
 * Minimalist single-card layout consistent with the rest of the app.
 */
export function AuthScreen() {
  const login = useStore((s) => s.login)
  const register = useStore((s) => s.register)
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggle)

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isRegister = mode === 'register'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isRegister) await register(name.trim(), email.trim(), password)
      else await login(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5">
      {/* Theme toggle (top-right) — available before sign-in too. */}
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        aria-label="Toggle theme"
        className="absolute right-5 top-5 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Wallet size={20} />
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            Spendify
          </h1>
          <p className="text-xs text-slate-400">
            {isRegister
              ? 'Create an account to start tracking'
              : 'Welcome back — sign in to continue'}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100"
        >
          {isRegister && (
            <Field label="Name" htmlFor="name">
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={inputClass}
                autoComplete="name"
              />
            </Field>
          )}

          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              autoComplete="email"
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? 'At least 6 characters' : '••••••••'}
              className={inputClass}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </Field>

          {error && (
            <p className="mt-3 text-xs font-medium text-money-out">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {/* Toggle */}
        <p className="mt-4 text-center text-xs text-slate-400">
          {isRegister ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isRegister ? 'login' : 'register')
              setError(null)
            }}
            className="font-semibold text-slate-700 underline-offset-2 hover:underline"
          >
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </div>
  )
}
