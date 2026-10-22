import mongoose from 'mongoose'
import type { Model } from 'mongoose'
import { NotFoundError } from '../errors.js'
import AuditRecord from '../models/AuditRecord.js'
import ContactRequest from '../models/ContactRequest.js'
import { REQUEST_STATUSES } from '../models/requestStatus.js'
import type { RequestStatus } from '../models/requestStatus.js'
import { searchFilter } from '../utils/search.js'
import type { AdminIdentity } from './adminAuth.js'
import { createNote, listNotes } from './staffNotes.js'

export const REQUEST_PAGE_SIZE = 25
const HISTORY_LIMIT = 50

interface StoredRequest {
  reference: string
  status: string
  createdAt: Date
  updatedAt: Date
}

// What a kind of customer request needs: contact requests are the only kind (customers buy in the
// shop or ask through the contact form); kept separate so another kind can reuse the listing,
// status changes, history, and notes.
interface RequestKind<Doc extends StoredRequest> {
  targetType: 'contactRequest'
  model: Model<Doc>
  // Fields the list search matches: the reference and the customer's name, company, and email.
  searchFields: string[]
  summarize: (doc: Doc) => { name: string, company: string, email: string, summary: string }
  details: (doc: Doc) => Record<string, unknown>
}

function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

const contactRequestKind: RequestKind<mongoose.InferSchemaType<typeof ContactRequest.schema> & StoredRequest> = {
  targetType: 'contactRequest',
  model: ContactRequest,
  searchFields: ['reference', 'fullName', 'company', 'email'],
  summarize: (doc) => ({ name: doc.fullName, company: doc.company, email: doc.email, summary: truncate(doc.subject ? `${doc.subject}: ${doc.message}` : doc.message, 120) }),
  details: (doc) => ({
    customer: { fullName: doc.fullName, company: doc.company, email: doc.email, phone: doc.phone },
    subject: doc.subject,
    message: doc.message,
  }),
}

function makeService<Doc extends StoredRequest>(kind: RequestKind<Doc>) {
  async function history(reference: string) {
    const records = await AuditRecord.find({ targetType: kind.targetType, targetId: reference }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_LIMIT).lean()
    return records.map((record) => ({ actor: { name: record.actor?.name ?? '', email: record.actor?.email ?? '' }, changes: record.changes, createdAt: record.createdAt }))
  }

  function toDetail(doc: Doc) {
    return { reference: doc.reference, status: doc.status, createdAt: doc.createdAt, updatedAt: doc.updatedAt, ...kind.details(doc) }
  }

  async function get(reference: string) {
    const doc = await kind.model.findOne({ reference })
    if (!doc) throw new NotFoundError('Request not found.')
    const [statusHistory, staffNotes] = await Promise.all([history(reference), listNotes(kind.targetType, reference)])
    return { item: toDetail(doc), history: statusHistory, notes: staffNotes }
  }

  return {
    get,

    // Newest first, optionally one status only and matching a search, with a count per status (of the
    // matching requests) for the filter buttons.
    async list(page: number, status: RequestStatus | null, search: string) {
      const matching = searchFilter(search, kind.searchFields)
      const filter = status ? { ...matching, status } : matching
      const [total, docs, grouped] = await Promise.all([
        kind.model.countDocuments(filter),
        kind.model.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * REQUEST_PAGE_SIZE).limit(REQUEST_PAGE_SIZE),
        kind.model.aggregate<{ _id: string, count: number }>([{ $match: matching }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      ])
      const counts = Object.fromEntries(REQUEST_STATUSES.map((name) => [name, grouped.find((group) => group._id === name)?.count ?? 0]))
      return {
        items: docs.map((doc) => ({ reference: doc.reference, status: doc.status, createdAt: doc.createdAt, ...kind.summarize(doc) })),
        page,
        totalPages: Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE)),
        total,
        counts,
      }
    },

    // The status change and its audit record are saved together, as with product changes. Setting the
    // status it already has changes nothing and records nothing.
    async setStatus(admin: AdminIdentity, reference: string, status: RequestStatus) {
      await mongoose.connection.transaction(async (session) => {
        const before = await kind.model.findOne({ reference }).session(session)
        if (!before) throw new NotFoundError('Request not found.')
        const from = before.status
        if (from === status) return
        await kind.model.updateOne({ reference }, { $set: { status } }, { session, runValidators: true })
        await AuditRecord.create([{
          action: `${kind.targetType}.status`,
          targetType: kind.targetType,
          targetId: reference,
          actor: { adminId: admin.id, email: admin.email, name: admin.name },
          changes: [{ field: 'status', from, to: status }],
        }], { session })
      })
      return get(reference)
    },

    async addNote(admin: AdminIdentity, reference: string, text: string) {
      if (!await kind.model.exists({ reference })) throw new NotFoundError('Request not found.')
      await createNote(admin, kind.targetType, reference, text)
      return get(reference)
    },
  }
}

export const adminRequests = {
  contactRequest: makeService(contactRequestKind),
}
