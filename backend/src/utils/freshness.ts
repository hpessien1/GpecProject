import type mongoose from 'mongoose'

// Short-lived copies of public reads (audit M-08): the catalogue, the site's text, and the health
// check used to reach the database on every request, so anyone repeating them could wear down the
// database (on Atlas's free tier, its weekly data allowance) for the whole site.

// Counts saved changes to one collection, so a copy of its data can tell it is out of date.
export class ChangeCounter {
  version = 0
  readonly bump = () => {
    this.version++
  }
}

interface MaybeSession {
  hasEnded?: boolean
  once?: (event: 'ended', listener: () => void) => unknown
}

// Counts every write to the schema's collection made through Mongoose in this process: saves,
// updates, deletes, and inserts, from staff screens, checkout, or scripts' code. A write inside a
// transaction counts again when its session ends (after the commit), so a copy read while it was
// being saved, and so without it, is not kept. Writes from another process (a seed command) show
// once the copy expires.
export function countChanges(schema: mongoose.Schema, counter: ChangeCounter) {
  function counted(session: unknown) {
    counter.bump()
    const open = session as MaybeSession | null | undefined
    if (open && !open.hasEnded && typeof open.once === 'function') open.once('ended', counter.bump)
  }
  schema.post('save', function () {
    counted(this.$session())
  })
  schema.post(/^(update|replace|delete|findOneAnd)/, { document: false, query: true }, function (this: mongoose.Query<unknown, unknown>) {
    counted(this.getOptions().session)
  })
  schema.post('insertMany', () => counter.bump())
  schema.post('bulkWrite', () => counter.bump())
}

// A read shared by every request for up to ttlMs, and read again as soon as counter (if any) moves.
// Many requests at the same moment share one read; a failed read is not kept.
export function shortLived<T>(load: () => Promise<T>, ttlMs: number, counter: ChangeCounter | null = null) {
  let kept: { version: number, until: number, value: Promise<T> } | null = null
  return () => {
    const now = Date.now()
    const version = counter?.version ?? 0
    if (kept && kept.version === version && kept.until > now) return kept.value
    // The version from before the read: a change saved while it runs makes the next request read again.
    const value = load()
    const entry = { version, until: now + ttlMs, value }
    kept = entry
    value.catch(() => {
      if (kept === entry) kept = null
    })
    return value
  }
}
