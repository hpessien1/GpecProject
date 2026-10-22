import RequestNote from '../models/RequestNote.js'
import type { AdminIdentity } from './adminAuth.js'

const NOTES_LIMIT = 100

export type NoteTarget = 'contactRequest' | 'order'

// Staff's internal notes on a contact request or an order (models/RequestNote.ts): newest first, the
// last 100. Notes are only ever added, never edited or deleted.
export async function listNotes(targetType: NoteTarget, targetId: string) {
  const records = await RequestNote.find({ targetType, targetId }).sort({ createdAt: -1, _id: -1 }).limit(NOTES_LIMIT).lean()
  return records.map((note) => ({ author: { name: note.author?.name ?? '', email: note.author?.email ?? '' }, text: note.text, createdAt: note.createdAt }))
}

export async function createNote(admin: AdminIdentity, targetType: NoteTarget, targetId: string, text: string) {
  await RequestNote.create({ targetType, targetId, text, author: { adminId: admin.id, email: admin.email, name: admin.name } })
}
