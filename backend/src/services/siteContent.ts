import mongoose from 'mongoose'
import { DEFAULTS_WRITTEN, SITE_CONTENT_DEFAULTS } from '../data/siteContentDefaults.js'
import type { SiteContentFields } from '../data/siteContentDefaults.js'
import AuditRecord from '../models/AuditRecord.js'
import SiteContent, { SITE_CONTENT_KEYS } from '../models/SiteContent.js'
import type { SiteContentKey } from '../models/SiteContent.js'
import type { Cursor } from '../utils/paging.js'
import type { SiteContentChanges } from '../validation/siteContent.js'
import type { AdminIdentity } from './adminAuth.js'
import { historyPage } from './auditHistory.js'

export interface SiteContentPage extends SiteContentFields {
  key: SiteContentKey
  approved: boolean
  // The last save, or when the starting text was written if nobody has saved the page yet.
  updatedAt: Date
}

const FIELDS = ['title', 'intro', 'sections', 'approved'] as const

interface StoredContent extends SiteContentFields {
  approved: boolean
  updatedAt: Date
}

function toPage(key: SiteContentKey, stored: StoredContent | null): SiteContentPage {
  if (!stored) return { key, ...SITE_CONTENT_DEFAULTS[key], approved: false, updatedAt: DEFAULTS_WRITTEN }
  return { key, title: stored.title, intro: stored.intro, sections: stored.sections.map(({ heading, body }) => ({ heading, body })), approved: stored.approved, updatedAt: stored.updatedAt }
}

export async function getSiteContent(key: SiteContentKey) {
  return toPage(key, await SiteContent.findById(key).lean<StoredContent>())
}

// Every page, for the admin's list: title, whether it is approved, and when it last changed.
export async function listSiteContent() {
  const stored = await SiteContent.find().lean<(StoredContent & { _id: SiteContentKey })[]>()
  return SITE_CONTENT_KEYS.map((key) => {
    const { title, approved, updatedAt } = toPage(key, stored.find((page) => page._id === key) ?? null)
    return { key, title, approved, updatedAt }
  })
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Saved with its audit record in one transaction (CLAUDE.md Section 4.6), so the history can always
// say who changed the wording and what it said before. Only fields that really change are recorded;
// sections are recorded whole (before and after), since staff reorder, add, and remove them.
export async function updateSiteContent(admin: AdminIdentity, key: SiteContentKey, changes: SiteContentChanges) {
  await mongoose.connection.transaction(async (session) => {
    const before = toPage(key, await SiteContent.findById(key).session(session).lean<StoredContent>())
    const after = { ...before, ...changes }
    const diffs = FIELDS.filter((field) => !sameValue(before[field], after[field])).map((field) => ({ field, from: before[field], to: after[field] }))
    if (diffs.length === 0) return
    // Every field is written: the first save creates the record from the starting text.
    await SiteContent.findOneAndUpdate({ _id: key }, { $set: Object.fromEntries(FIELDS.map((field) => [field, after[field]])) }, { upsert: true, runValidators: true, session })
    await AuditRecord.create([{ action: 'siteContent.update', targetType: 'siteContent', targetId: key, actor: { adminId: admin.id, email: admin.email, name: admin.name }, changes: diffs }], { session })
  })
  return getSiteContent(key)
}

export function siteContentHistory(key: SiteContentKey, before: Cursor | null) {
  return historyPage('siteContent', key, before)
}
