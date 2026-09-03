import { CATEGORIES, type Category } from '../types'

/**
 * User-defined custom categories.
 *
 * Categories are stored on transactions as plain strings (the DB column is
 * free-text), so a custom category "just works" end-to-end. The only thing we
 * need to persist locally is the *list of choices* offered in the picker, so a
 * user's custom categories keep showing up in future entries. We keep this in
 * localStorage — no backend change required.
 */
const KEY = 'spendify-custom-categories'

/** Read the user's saved custom categories (deduped, trimmed). */
export function getCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c) => typeof c === 'string' && c.trim().length > 0)
  } catch {
    return []
  }
}

/** Persist the full custom-category list. */
function save(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore quota/serialisation errors */
  }
}

/**
 * Add a new custom category (case-insensitive dedupe against both built-in and
 * existing custom ones). Returns the updated custom list.
 */
export function addCustomCategory(name: string): string[] {
  const trimmed = name.trim()
  const current = getCustomCategories()
  if (!trimmed) return current

  const existsBuiltIn = CATEGORIES.some(
    (c) => c.toLowerCase() === trimmed.toLowerCase(),
  )
  const existsCustom = current.some(
    (c) => c.toLowerCase() === trimmed.toLowerCase(),
  )
  if (existsBuiltIn || existsCustom) return current

  const next = [...current, trimmed]
  save(next)
  return next
}

/**
 * The full ordered list of categories offered in the picker: the built-in
 * ones first, then the user's custom additions.
 */
export function allCategories(custom: string[]): (Category | string)[] {
  return [...CATEGORIES, ...custom]
}
