import mongoose from 'mongoose'
import AdminUser from '../models/AdminUser.js'
import AuditRecord from '../models/AuditRecord.js'
import CustomerEmailSettings, { CUSTOMER_EMAIL_SETTINGS_ID } from '../models/CustomerEmailSettings.js'
import type { Cursor } from '../utils/paging.js'
import type { AdminIdentity } from './adminAuth.js'
import { historyPage } from './auditHistory.js'
import type { Notifier } from './notifications.js'

// GPEC's published email (the site footer and the privacy notice): where customers' replies go until
// staff choose another address. The emails come from a sending-only address that nobody reads.
export const DEFAULT_REPLY_TO = 'gpecengineeringcompanylimited@gmail.com'

export interface CustomerEmailFields {
  replyTo: string
}

export async function getCustomerEmailSettings(): Promise<CustomerEmailFields> {
  const stored = await CustomerEmailSettings.findById(CUSTOMER_EMAIL_SETTINGS_ID).lean()
  return { replyTo: stored?.replyTo ?? DEFAULT_REPLY_TO }
}

// Saved with its audit record in one transaction; an unchanged address changes and records nothing.
// After saving, every active admin is emailed the old and the new address, at their own login
// addresses, so a change nobody meant to make is noticed.
export async function updateCustomerEmailSettings(admin: AdminIdentity, changes: CustomerEmailFields, notifier: Notifier) {
  let from = DEFAULT_REPLY_TO
  await mongoose.connection.transaction(async (session) => {
    const before = await CustomerEmailSettings.findById(CUSTOMER_EMAIL_SETTINGS_ID).session(session).lean()
    from = before?.replyTo ?? DEFAULT_REPLY_TO
    if (from === changes.replyTo) return
    await CustomerEmailSettings.findOneAndUpdate({ _id: CUSTOMER_EMAIL_SETTINGS_ID }, { $set: { replyTo: changes.replyTo } }, { upsert: true, runValidators: true, session })
    await AuditRecord.create([{ action: 'customerEmail.update', targetType: 'customerEmail', targetId: CUSTOMER_EMAIL_SETTINGS_ID, actor: { adminId: admin.id, email: admin.email, name: admin.name }, changes: [{ field: 'replyTo', from, to: changes.replyTo }] }], { session })
  })
  if (from !== changes.replyTo) {
    const admins = await AdminUser.find({ isActive: true }).select('email').lean()
    void notifier.replyToChanged(admins.map((account) => account.email), admin, from, changes.replyTo)
  }
  return changes
}

export function customerEmailHistory(before: Cursor | null) {
  return historyPage('customerEmail', CUSTOMER_EMAIL_SETTINGS_ID, before)
}
