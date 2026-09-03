/**
 * Shared chart palette.
 *
 * A calm, minimal set of mid-tone hues — deliberately NO black / near-black
 * (the old palette led with `#0f172a`, which read as harsh black slices).
 * These sit nicely on both the light off-white canvas and a dark background.
 */
export const CHART_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef7d7d', // soft red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
  '#14b8a6', // teal
  '#a78bfa', // light violet
]

/** Semantic hues for money direction (softer than pure green/red). */
export const MONEY_IN_COLOR = '#10b981' // emerald — money in / income
export const MONEY_OUT_COLOR = '#ef7d7d' // soft red — money out / spend

/** Primary accent used for the spend area/line series. */
export const ACCENT_COLOR = '#6366f1' // indigo
