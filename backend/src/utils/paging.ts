import mongoose from 'mongoose'

// One page size for every admin list, history, and set of notes: short enough to read on a phone,
// and GPEC's staff see the paging with the demo data (owner's choice, 2026-10-23).
export const ADMIN_PAGE_SIZE = 10

// Where a numbered page sits in a list of `total` items, for the admin lists' replies.
export function pageInfo(page: number, total: number) {
  return { page, pageSize: ADMIN_PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)), total }
}

export const skipTo = (page: number) => (page - 1) * ADMIN_PAGE_SIZE

// Newest-first pages of a record's history or notes, by cursor rather than page number: an entry added
// while staff read (a sale, a note) cannot push another onto the next page and show it twice. The
// cursor names the last entry shown, as "<createdAt in milliseconds>-<_id>"; the next page holds the
// entries sorted after it.
export interface Cursor {
  createdAt: Date
  id: mongoose.Types.ObjectId
}

const CURSOR_PATTERN = /^(\d{1,15})-([0-9a-f]{24})$/

export function parseCursor(value: string): Cursor | null {
  const match = CURSOR_PATTERN.exec(value)
  return match ? { createdAt: new Date(Number(match[1])), id: new mongoose.Types.ObjectId(match[2]) } : null
}

export const NEWEST_FIRST = { createdAt: -1, _id: -1 } as const

// Entries sorted after the cursor (all of them without one). Entries saved in the same millisecond are
// told apart by _id, as in the sort.
export function olderThan(cursor: Cursor | null) {
  if (!cursor) return {}
  return { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }] }
}

// Query one record more than the page size: it only shows whether an older page exists.
export function toPage<Stored extends { _id: mongoose.Types.ObjectId, createdAt: Date }, Entry>(records: Stored[], size: number, map: (record: Stored) => Entry) {
  const shown = records.slice(0, size)
  const last = shown.at(-1)
  return { entries: shown.map(map), cursor: records.length > size && last ? `${last.createdAt.getTime()}-${last._id.toHexString()}` : null }
}
