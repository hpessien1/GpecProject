import type { Request } from 'express'
import mongoose from 'mongoose'
import AdminUser from '../models/AdminUser.js'
import SecurityEvent from '../models/SecurityEvent.js'
import type { SecurityAction, TARGET_TYPES } from '../models/SecurityEvent.js'
import { ADMIN_PAGE_SIZE, NEWEST_FIRST, pageInfo, skipTo } from '../utils/paging.js'

// Writes and reads the security log (models/SecurityEvent.ts, audit M-06).

export interface SecurityEventInput {
  action: SecurityAction
  outcome: 'success' | 'failure'
  reason?: string | null
  detail?: string | null
  // The account, by ID when known, or by the email address typed (looked up; an address that is not an
  // admin's is not kept).
  adminId?: string | null
  email?: string | null
  target?: { type: typeof TARGET_TYPES[number], id: string } | null
}

async function findAccount({ adminId, email }: SecurityEventInput) {
  const filter = adminId && mongoose.isObjectIdOrHexString(adminId) ? { _id: adminId } : typeof email === 'string' && email ? { email: email.trim().toLowerCase() } : null
  if (!filter) return null
  const admin = await AdminUser.findOne(filter).select('email name role').lean()
  return admin ? { adminId: admin._id, email: admin.email, name: admin.name, role: admin.role ?? 'admin' } : null
}

// Saves one entry. request: where it came from (address and browser); null for the admin command.
// Never throws: a log that cannot be written must not stop a login or a change; it is reported in
// the server's own log instead.
export async function recordSecurityEvent(request: Request | null, input: SecurityEventInput) {
  try {
    await SecurityEvent.create({
      action: input.action,
      outcome: input.outcome,
      reason: input.reason ?? null,
      detail: input.detail ?? null,
      account: await findAccount(input),
      target: input.target ?? null,
      via: request ? 'website' : 'command line',
      ip: (request?.ip ?? '').slice(0, 60),
      userAgent: (request?.get('user-agent') ?? '').slice(0, 300),
    })
  } catch (error) {
    console.error(`Security log: an entry could not be saved (${input.action}, ${error instanceof Error ? error.name : 'unknown error'}).`)
  }
}

export interface SecurityLogQuery {
  page: number
  adminId: string | null
  // Entries from `from` (included) up to `to` (not included); either may be left open.
  from: Date | null
  to: Date | null
}

// One numbered page of the log, newest first, optionally one account's entries and a range of dates
// only, with every account (active or not) to filter by. Entries are only ever added, at the newest end,
// so one arriving while staff read can push an entry onto the next page and show it twice; it never
// hides one.
export async function securityLogPage({ page, adminId, from, to }: SecurityLogQuery) {
  const createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) }
  const filter = {
    ...(adminId ? { 'account.adminId': new mongoose.Types.ObjectId(adminId) } : {}),
    ...(from || to ? { createdAt } : {}),
  }
  const [records, total, admins] = await Promise.all([
    SecurityEvent.find(filter).sort(NEWEST_FIRST).skip(skipTo(page)).limit(ADMIN_PAGE_SIZE).lean(),
    SecurityEvent.countDocuments(filter),
    AdminUser.find().select('email name').sort({ name: 1 }).lean(),
  ])
  const entries = records.map((record) => ({
    action: record.action,
    outcome: record.outcome,
    reason: record.reason ?? null,
    detail: record.detail ?? null,
    account: record.account ? { name: record.account.name, email: record.account.email, role: record.account.role } : null,
    target: record.target ? { type: record.target.type, id: record.target.id } : null,
    via: record.via,
    ip: record.ip ?? '',
    userAgent: record.userAgent ?? '',
    createdAt: record.createdAt,
  }))
  return { entries, ...pageInfo(page, total), accounts: admins.map((admin) => ({ id: String(admin._id), name: admin.name, email: admin.email })) }
}
