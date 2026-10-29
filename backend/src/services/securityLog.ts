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

export interface RepeatSettings {
  // Refusals of one kind from one address written in full in each window; the rest are counted.
  perSource: number
  windowMs: number
  // Addresses counted at once; past that, refusals from new addresses are counted together.
  maxSources: number
  // Refusals written in full across the site in each window.
  maxWrites: number
  now?: () => number
}

// The user's choice (2026-10-29): five of a kind from one address in 15 minutes, as the login limit.
export const REPEAT_SETTINGS: RepeatSettings = { perSource: 5, windowMs: 15 * 60_000, maxSources: 1_000, maxWrites: 500 }

// Repeats of one kind of refusal from one address ('' when counted together from many).
export interface RefusalRepeats {
  action: SecurityAction
  reason: string
  ip: string
  userAgent: string
  since: number
  written: number
  repeats: number
}

// Audit S2-M02: anyone on the internet can be refused as often as they like (a login after the limit,
// a change sent from another site, a logout), and one entry each would let them fill the database and
// bury the entries that matter. So the first few refusals of a kind from an address are written in
// full, and the rest are only counted, then written as one entry with the count when the address's
// window ends. Successes are always written in full. In memory: one API instance only (CLAUDE.md 6.3),
// held for at most maxSources addresses plus one place per kind of refusal for all other addresses.
export class RepeatedRefusals {
  private readonly sources = new Map<string, RefusalRepeats>()
  private ended: RefusalRepeats[] = []
  private readonly now: () => number
  private windowStart: number
  private writes = 0

  constructor(private readonly settings: RepeatSettings = REPEAT_SETTINGS) {
    this.now = settings.now ?? Date.now
    this.windowStart = this.now()
  }

  // True, and counted, when this refusal is to be written in full; false when it is only counted.
  admit(action: SecurityAction, reason: string, ip: string, userAgent: string) {
    const now = this.now()
    if (now - this.windowStart >= this.settings.windowMs) {
      this.windowStart = now
      this.writes = 0
    }
    const own = `${action} ${reason} ${ip}`
    const shared = `${action} ${reason} *`
    this.endIfOver(own, now)
    this.endIfOver(shared, now)
    let source = this.sources.get(own)
    if (!source && this.sources.size >= this.settings.maxSources) {
      // Too many addresses at once: counted together, never written one by one.
      source = this.sources.get(shared) ?? this.start(shared, action, reason, '', now, this.settings.perSource)
    }
    source ??= this.start(own, action, reason, ip, now, 0)
    source.userAgent = userAgent.slice(0, 300)
    if (source.written < this.settings.perSource && this.writes < this.settings.maxWrites) {
      source.written++
      this.writes++
      return true
    }
    source.repeats++
    return false
  }

  // The counts whose window has ended (all of them with all, when the server stops), ready to write.
  takeEnded(all = false) {
    const now = this.now()
    // Deleting the current entry while going through a Map is safe.
    for (const key of this.sources.keys()) {
      if (all) this.end(key)
      else this.endIfOver(key, now)
    }
    const ended = this.ended
    this.ended = []
    return ended
  }

  private start(key: string, action: SecurityAction, reason: string, ip: string, now: number, written: number) {
    const source = { action, reason, ip, userAgent: '', since: now, written, repeats: 0 }
    this.sources.set(key, source)
    return source
  }

  private endIfOver(key: string, now: number) {
    const source = this.sources.get(key)
    if (source && now - source.since >= this.settings.windowMs) this.end(key)
  }

  private end(key: string) {
    const source = this.sources.get(key)
    if (source && source.repeats > 0) this.ended.push(source)
    this.sources.delete(key)
  }
}

// Writes one entry per count that has ended, one after another, so writing never runs many at once.
export async function writeRepeatedRefusals(repeated: RepeatedRefusals, all = false) {
  for (const source of repeated.takeEnded(all)) {
    try {
      await SecurityEvent.create({
        action: source.action,
        outcome: 'failure',
        reason: source.reason,
        via: 'website',
        ip: source.ip,
        userAgent: source.userAgent,
        repeats: source.repeats,
        repeatsSince: new Date(source.since),
      })
    } catch (error) {
      console.error(`Security log: a count of repeated refusals could not be saved (${source.action}, ${error instanceof Error ? error.name : 'unknown error'}).`)
    }
  }
}

// Saves one entry. request: where it came from (address and browser); null for the admin command.
// A refusal from the website is written in full only while RepeatedRefusals allows it (set on the app
// by app.ts), before the account is looked up, so a repeat costs no database work.
// Never throws: a log that cannot be written must not stop a login or a change; it is reported in
// the server's own log instead.
export async function recordSecurityEvent(request: Request | null, input: SecurityEventInput) {
  const repeated: unknown = request?.app?.locals.repeatedRefusals
  if (request && input.outcome === 'failure' && repeated instanceof RepeatedRefusals
    && !repeated.admit(input.action, input.reason ?? '', (request.ip ?? '').slice(0, 60), request.get('user-agent') ?? '')) return
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
    repeats: record.repeats ?? null,
    repeatsSince: record.repeatsSince ?? null,
    createdAt: record.createdAt,
  }))
  return { entries, ...pageInfo(page, total), accounts: admins.map((admin) => ({ id: String(admin._id), name: admin.name, email: admin.email })) }
}
