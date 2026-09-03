/** Formatting helpers kept tiny and dependency-free. */

// Indian Rupee formatting with the en-IN locale so amounts use the ₹ symbol
// and Indian digit grouping (e.g. ₹1,23,456.00).
const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format a number as currency, e.g. 12.5 → "₹12.50". */
export function formatMoney(amount: number): string {
  return currency.format(amount)
}

/** Format an ISO date (YYYY-MM-DD) as a short, readable label. */
export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Today's date as an ISO YYYY-MM-DD string (local time). */
export function todayISO(): string {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 10)
}

/** Round to 2 decimal places to avoid floating point noise. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
