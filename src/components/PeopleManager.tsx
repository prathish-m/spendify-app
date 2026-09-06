import { useState } from 'react'
import {
  Plus,
  Trash2,
  Users,
  Link2,
  Check,
  X,
  Loader2,
  Pencil,
  Merge,
  ChevronRight,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useConfirm } from './ui/ConfirmDialog'
import { FullScreenSheet } from './ui/FullScreenSheet'
import { FriendDetail } from './FriendDetail'
import type { Person } from '../types'

/** Deterministic monochrome initials avatar. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
      {initials || '?'}
    </span>
  )
}

/**
 * Lightweight people management: add friends/roommates you split with and
 * remove them. Presented as a clean, borderless inline form + divided list.
 */
export function PeopleManager() {
  const people = useStore((s) => s.people)
  const addPerson = useStore((s) => s.addPerson)
  const removePerson = useStore((s) => s.removePerson)
  const confirm = useConfirm()
  const [name, setName] = useState('')
  // Prevents a double-click / rapid Enter from adding the same person twice.
  const [adding, setAdding] = useState(false)
  // When set, opens the per-friend detail sheet (splits + loans).
  const [detailPerson, setDetailPerson] = useState<Person | null>(null)

  const confirmRemove = async (id: string, personName: string) => {
    const ok = await confirm({
      title: `Remove ${personName}?`,
      message:
        'This also removes any split expenses that involve them. This cannot be undone.',
      confirmLabel: 'Remove',
    })
    if (ok) await removePerson(id)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || adding) return
    setAdding(true)
    try {
      await addPerson(name)
      setName('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
      <div className="mb-4 flex items-center gap-2">
        <Users size={16} className="text-slate-400" />
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">
          People
        </h2>
        <span className="ml-auto text-xs text-slate-400">
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </span>
      </div>

      {/* Add form — borderless input with a subtle bottom divider. */}
      <form onSubmit={submit} className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a friend or roommate…"
          className="w-full border-0 bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0"
        />
        <button
          type="submit"
          disabled={!name.trim() || adding}
          className="flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-30"
        >
          {adding ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}{' '}
          Add
        </button>
      </form>

      {people.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          No people yet. Add someone to start splitting.
        </p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {people.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              allPeople={people}
              onRemove={() => confirmRemove(p.id, p.name)}
              onOpen={() => setDetailPerson(p)}
            />
          ))}
        </ul>
      )}

      {/* Per-friend detail: splits + loans + combined balance. */}
      <FullScreenSheet
        open={detailPerson !== null}
        onClose={() => setDetailPerson(null)}
        title={detailPerson ? detailPerson.name : 'Friend'}
      >
        {detailPerson && <FriendDetail personId={detailPerson.id} />}
      </FullScreenSheet>
    </section>
  )
}

/** A single friend row with rename + linking + merge controls. */
function PersonRow({
  person,
  allPeople,
  onRemove,
  onOpen,
}: {
  person: Person
  allPeople: Person[]
  onRemove: () => void
  onOpen: () => void
}) {
  const linkPerson = useStore((s) => s.linkPerson)
  const renamePerson = useStore((s) => s.renamePerson)
  const mergePerson = useStore((s) => s.mergePerson)
  const [linking, setLinking] = useState(false)
  const [merging, setMerging] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inline rename state (local display name only).
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(person.name)

  const isLinked = Boolean(
    person.linkStatus === 'accepted' && person.linkedUserId,
  )
  const mergeTargets = allPeople.filter((p) => p.id !== person.id)
  const linkedOf = (p: Person) =>
    Boolean(p.linkStatus === 'accepted' && p.linkedUserId)

  // Rule 3 alias prompt: when neither the source nor the chosen target is
  // linked, ask which display name the merged contact should keep. Holds the
  // target being merged into (null = prompt closed).
  const [aliasFor, setAliasFor] = useState<Person | null>(null)

  const runMerge = async (intoId: string, keepName?: string) => {
    setBusy(true)
    setError(null)
    try {
      await mergePerson(person.id, intoId, keepName)
      setAliasFor(null)
      setMerging(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge contacts')
    } finally {
      setBusy(false)
    }
  }

  const onPickMergeTarget = (target: Person) => {
    setError(null)
    // Rule 1: two linked accounts can't be merged — block before any request.
    if (isLinked && linkedOf(target)) {
      setError("Can't merge two linked accounts")
      return
    }
    // Rule 2: exactly one side linked → the link is preserved server-side, and
    // linked contacts keep their real-account name, so no alias choice is
    // needed; merge straight away.
    if (isLinked || linkedOf(target)) {
      void runMerge(target.id)
      return
    }
    // Rule 3: both unlinked → ask which alias the survivor should keep.
    setAliasFor(target)
  }

  const submitRename = async () => {
    const next = draftName.trim()
    if (!next || next === person.name) {
      setRenaming(false)
      return
    }
    await renamePerson(person.id, next)
    setRenaming(false)
  }

  const submitLink = async () => {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      await linkPerson(person.id, email.trim())
      setLinking(false)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename()
                if (e.key === 'Escape') {
                  setDraftName(person.name)
                  setRenaming(false)
                }
              }}
              onBlur={submitRename}
              autoFocus
              className="w-full rounded-md border-0 bg-slate-100 px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-300"
            />
          ) : (
            // Tap the name to open the per-friend detail (splits + loans).
            <button
              type="button"
              onClick={onOpen}
              className="flex w-full items-center gap-1 text-left"
              aria-label={`View details for ${person.name}`}
            >
              <span className="block truncate text-sm text-slate-700">
                {person.name}
              </span>
              <ChevronRight size={13} className="shrink-0 text-slate-300" />
            </button>
          )}
          {isLinked && (
            <span className="block truncate text-[11px] text-money-in">
              Linked · {person.linkedEmail}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Rename edits your LOCAL display name. It's allowed even for linked
              friends — it only relabels your own reference, never their real
              account (the server's renameFriend preserves the link). */}
          {!renaming && (
            <button
              onClick={() => {
                setDraftName(person.name)
                setRenaming(true)
              }}
              className="rounded-full p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label={`Rename ${person.name}`}
              title="Rename (your local label)"
            >
              <Pencil size={14} />
            </button>
          )}
          {/* Merge this contact into another (fold a duplicate onto a survivor). */}
          {mergeTargets.length > 0 && (
            <button
              onClick={() => setMerging((v) => !v)}
              className="rounded-full p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label={`Merge ${person.name} into another contact`}
              title="Merge into another contact"
            >
              <Merge size={15} />
            </button>
          )}
          {isLinked ? (
            <span
              className="flex items-center gap-1 rounded-full bg-money-in/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-money-in"
              title="Linked to a real account"
            >
              <Check size={11} /> Linked
            </span>
          ) : (
            <button
              onClick={() => setLinking((v) => !v)}
              className="rounded-full p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label={`Link ${person.name} to an account`}
              title="Link to a real account"
            >
              <Link2 size={15} />
            </button>
          )}
          <button
            onClick={onRemove}
            className="rounded-full p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-money-out"
            aria-label={`Remove ${person.name}`}
            title="Remove (also removes their split expenses)"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Inline link-by-email form */}
      {linking && !isLinked && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitLink()
              if (e.key === 'Escape') setLinking(false)
            }}
            placeholder="friend@email.com"
            autoFocus
            className="w-full border-0 bg-transparent p-0 text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-0"
          />
          <button
            onClick={submitLink}
            disabled={busy || !email.trim()}
            className="flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-30"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Link
          </button>
          <button
            onClick={() => setLinking(false)}
            aria-label="Cancel"
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={13} />
          </button>
        </div>
      )}
      {/* Inline merge picker: choose which contact to fold this one into. */}
      {merging && mergeTargets.length > 0 && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2">
          <p className="mb-1.5 px-1 text-[11px] text-slate-500">
            Merge <span className="font-medium">{person.name}</span> into…
          </p>
          <div className="flex flex-wrap gap-1.5">
            {mergeTargets.map((t) => {
              // Rule 1: a linked contact can't be merged into another linked
              // contact — disable those targets when this source is linked.
              const blocked = isLinked && linkedOf(t)
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy || blocked}
                  onClick={() => onPickMergeTarget(t)}
                  title={
                    blocked ? "Can't merge two linked accounts" : undefined
                  }
                  className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-100 disabled:opacity-40"
                >
                  {t.name}
                  {linkedOf(t) && (
                    <Check size={10} className="text-money-in" />
                  )}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                setMerging(false)
                setAliasFor(null)
              }}
              aria-label="Cancel merge"
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
            >
              <X size={13} />
            </button>
          </div>

          {/* Rule 3: both unlinked → pick which name the merged contact keeps. */}
          {aliasFor && (
            <div className="mt-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
              <p className="mb-1.5 px-0.5 text-[11px] text-slate-500">
                Keep which name for the merged contact?
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runMerge(aliasFor.id, aliasFor.name)}
                  className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity disabled:opacity-40"
                >
                  {aliasFor.name}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runMerge(aliasFor.id, person.name)}
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-100 disabled:opacity-40"
                >
                  {person.name}
                </button>
                <button
                  type="button"
                  onClick={() => setAliasFor(null)}
                  aria-label="Cancel"
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-money-out">{error}</p>}
    </li>
  )
}
