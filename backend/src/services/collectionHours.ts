import mongoose from 'mongoose'
import AuditRecord from '../models/AuditRecord.js'
import CollectionSettings, { COLLECTION_SETTINGS_ID } from '../models/CollectionSettings.js'
import type { Cursor } from '../utils/paging.js'
import type { AdminIdentity } from './adminAuth.js'
import { historyPage } from './auditHistory.js'

// The hours GPEC gave for collecting pickup orders (2026-10-31), until staff save others.
export const DEFAULT_COLLECTION_HOURS = '9am to 5pm'

export async function getCollectionHours() {
  const stored = await CollectionSettings.findById(COLLECTION_SETTINGS_ID).lean()
  return stored?.hours ?? DEFAULT_COLLECTION_HOURS
}

// Saved with its audit record in one transaction; unchanged hours change and record nothing.
export async function updateCollectionHours(admin: AdminIdentity, hours: string) {
  await mongoose.connection.transaction(async (session) => {
    const before = await CollectionSettings.findById(COLLECTION_SETTINGS_ID).session(session).lean()
    const from = before?.hours ?? DEFAULT_COLLECTION_HOURS
    if (from === hours) return
    await CollectionSettings.findOneAndUpdate({ _id: COLLECTION_SETTINGS_ID }, { $set: { hours } }, { upsert: true, runValidators: true, session })
    await AuditRecord.create([{ action: 'collection.update', targetType: 'collection', targetId: COLLECTION_SETTINGS_ID, actor: { adminId: admin.id, email: admin.email, name: admin.name }, changes: [{ field: 'hours', from, to: hours }] }], { session })
  })
  return hours
}

export function collectionHoursHistory(before: Cursor | null) {
  return historyPage('collection', COLLECTION_SETTINGS_ID, before)
}
