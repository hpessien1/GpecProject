import RequestNote from '../models/RequestNote.js'
import { ADMIN_PAGE_SIZE, NEWEST_FIRST, olderThan, toPage } from '../utils/paging.js'
import type { Cursor } from '../utils/paging.js'
import type { AdminIdentity } from './adminAuth.js'

export type NoteTarget = 'contactRequest' | 'order'

// Staff's internal notes on a contact request or an order (models/RequestNote.ts): one page, newest
// first, and the cursor for the older page after it (null when there is none). Notes are only ever
// added, never edited or deleted.
export async function listNotes(targetType: NoteTarget, targetId: string, before: Cursor | null) {
  const records = await RequestNote.find({ targetType, targetId, ...olderThan(before) }).sort(NEWEST_FIRST).limit(ADMIN_PAGE_SIZE + 1).lean()
  const { entries, cursor } = toPage(records, ADMIN_PAGE_SIZE, (note) => ({ author: { name: note.author?.name ?? '', email: note.author?.email ?? '' }, text: note.text, createdAt: note.createdAt }))
  return { notes: entries, notesCursor: cursor }
}

export async function createNote(admin: AdminIdentity, targetType: NoteTarget, targetId: string, text: string) {
  await RequestNote.create({ targetType, targetId, text, author: { adminId: admin.id, email: admin.email, name: admin.name } })
}
