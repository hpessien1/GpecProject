import mongoose from 'mongoose'
import AuditRecord from '../models/AuditRecord.js'
import ContactRequest from '../models/ContactRequest.js'
import Order from '../models/Order.js'
import PendingFileDeletion from '../models/PendingFileDeletion.js'
import RequestNote from '../models/RequestNote.js'
import type { ImageStore } from './imageStore.js'
import { requestFileKey } from './requestFiles.js'
import { recordSecurityEvent } from './securityLog.js'

// How long customer data is kept (periods agreed with GPEC, 2026-10-31; CLAUDE.md Section 4.9). Off
// until RETENTION_CLEANUP=on. The security log has its own 12 months (models/SecurityEvent.ts).
export const UNPAID_ORDER_MONTHS = 6
export const CONTACT_REQUEST_MONTHS = 6
export const PAID_ORDER_YEARS = 6
// Per kind, per run: a first run on a large backlog carries on the next day.
const BATCH_SIZE = 500
const DAY_MS = 24 * 60 * 60_000
// Soon after a start, so a server restarted often still runs it.
const FIRST_RUN_DELAY_MS = 60_000
// Nigeria is UTC+1 all year.
const LAGOS_OFFSET_MS = 60 * 60_000

export interface RetentionCutoffs {
  contactRequests: Date
  unpaidOrders: Date
  // null: GPEC's accounting year end is not set, so no paid order can be counted as due.
  paidOrders: Date | null
}

function monthsBefore(now: Date, months: number) {
  const date = new Date(now)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() - months)
  // The same day, or the month's last if it is shorter (31 August back to 28 or 29 February).
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date
}

// The moment an accounting year ending on month-day of `year` ends: midnight after it, in Nigeria.
function yearEnd(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day + 1) - LAGOS_OFFSET_MS)
}

// Six years run from the end of the accounting year of the payment. So a paid order is due once six
// years have passed since its own year ended: paid on or before the latest year end that is at least
// six years old.
export function paidOrderCutoff(now: Date, accountingYearEnd: string) {
  const [month = 12, day = 31] = accountingYearEnd.split('-').map(Number)
  let latestYear = now.getUTCFullYear() + 1
  while (yearEnd(latestYear, month, day) > now) latestYear--
  return yearEnd(latestYear - PAID_ORDER_YEARS, month, day)
}

export function retentionCutoffs(now: Date, accountingYearEnd: string | null): RetentionCutoffs {
  return {
    contactRequests: monthsBefore(now, CONTACT_REQUEST_MONTHS),
    unpaidOrders: monthsBefore(now, UNPAID_ORDER_MONTHS),
    paidOrders: accountingYearEnd ? paidOrderCutoff(now, accountingYearEnd) : null,
  }
}

// What is due. Each filter is checked again by the delete itself, inside its transaction, so a request
// reopened or kept, or an order paid, a moment before is left alone.
// - Contact requests: closed, not kept, unchanged since the cutoff (closing is the last change; a request
//   reopened and closed again counts from the later closing). Never closed: never due.
export const dueContactRequests = (cutoffs: RetentionCutoffs) => ({ status: 'closed', keepRecord: { $ne: true }, updatedAt: { $lte: cutoffs.contactRequests } })
// - Unpaid orders: closed or abandoned, unchanged since the cutoff. A late payment makes one paid.
export const dueUnpaidOrders = (cutoffs: RetentionCutoffs) => ({ paymentStatus: { $in: ['pending_payment', 'failed'] }, updatedAt: { $lte: cutoffs.unpaidOrders } })
// - Paid orders: finished with, and paid at least six accounting years ago. One still being fulfilled,
//   or with no payment date, is never due.
const duePaidOrders = (paidBefore: Date) => ({ paymentStatus: 'paid', fulfilmentStatus: { $in: ['completed', 'cancelled'] }, paidAt: { $ne: null, $lte: paidBefore } })

// How many records are due now, for the preview command: deletes nothing.
export async function previewCleanup(cutoffs: RetentionCutoffs) {
  const [contactRequests, unpaidOrders, paidOrders, kept] = await Promise.all([
    ContactRequest.countDocuments(dueContactRequests(cutoffs)),
    Order.countDocuments(dueUnpaidOrders(cutoffs)),
    cutoffs.paidOrders ? Order.countDocuments(duePaidOrders(cutoffs.paidOrders)) : null,
    ContactRequest.countDocuments({ keepRecord: true }),
  ])
  return { contactRequests, unpaidOrders, paidOrders, kept, filesWaiting: await PendingFileDeletion.countDocuments() }
}

// One contact request with its notes and history, and a note of its files to remove, all or nothing.
export async function deleteContactRequest(reference: string, filter: object) {
  return mongoose.connection.transaction(async (session) => {
    const request = await ContactRequest.findOneAndDelete({ ...filter, reference }, { session })
    if (!request) return false
    await RequestNote.deleteMany({ targetType: 'contactRequest', targetId: reference }, { session })
    await AuditRecord.deleteMany({ targetType: 'contactRequest', targetId: reference }, { session })
    const files = (request.attachments ?? []).map((file) => ({ key: requestFileKey(file.id) }))
    if (files.length > 0) await PendingFileDeletion.create(files, { session, ordered: true })
    return true
  })
}

// One order with its notes and history. Stock history on products stays: it names only the reference.
export async function deleteOrder(reference: string, filter: object) {
  return mongoose.connection.transaction(async (session) => {
    const { deletedCount } = await Order.deleteOne({ ...filter, reference }, { session })
    if (deletedCount === 0) return false
    await RequestNote.deleteMany({ targetType: 'order', targetId: reference }, { session })
    await AuditRecord.deleteMany({ targetType: 'order', targetId: reference }, { session })
    return true
  })
}

// Files waiting to be removed. One that fails stays listed and is tried again on the next run.
async function removeWaitingFiles(store: ImageStore | null) {
  if (!store) return 0
  let removed = 0
  for (const { key } of await PendingFileDeletion.find().limit(BATCH_SIZE * 5).lean()) {
    try {
      await store.remove(key)
      await PendingFileDeletion.deleteOne({ key })
      removed++
    } catch (error) {
      console.error(`Data clean-up: a file could not be removed (${error instanceof Error ? error.name : 'unknown error'}); it will be tried again.`)
    }
  }
  return removed
}

// One run. References only are read for the list; each record is then deleted in its own transaction,
// so one failure costs only that record, which is tried again on the next run.
export async function runCleanup(cutoffs: RetentionCutoffs, store: ImageStore | null) {
  const counts = { contactRequests: 0, unpaidOrders: 0, paidOrders: 0, files: 0 }

  async function clear(model: 'contactRequest' | 'order', filter: object, count: keyof typeof counts) {
    const due = model === 'contactRequest'
      ? await ContactRequest.find(filter).select('reference').limit(BATCH_SIZE).lean()
      : await Order.find(filter).select('reference').limit(BATCH_SIZE).lean()
    for (const { reference } of due) {
      try {
        if (await (model === 'contactRequest' ? deleteContactRequest : deleteOrder)(reference, filter)) counts[count]++
      } catch (error) {
        console.error(`Data clean-up: ${reference} could not be deleted (${error instanceof Error ? error.name : 'unknown error'}); it will be tried again.`)
      }
    }
  }

  await clear('contactRequest', dueContactRequests(cutoffs), 'contactRequests')
  await clear('order', dueUnpaidOrders(cutoffs), 'unpaidOrders')
  if (cutoffs.paidOrders) await clear('order', duePaidOrders(cutoffs.paidOrders), 'paidOrders')
  counts.files = await removeWaitingFiles(store)

  if (Object.values(counts).some((count) => count > 0)) {
    await recordSecurityEvent(null, {
      action: 'retention.cleanup',
      outcome: 'success',
      detail: `${counts.contactRequests} contact requests, ${counts.unpaidOrders} unpaid orders, ${counts.paidOrders} paid orders, ${counts.files} files`,
    })
  }
  return counts
}

// Runs soon after the server starts, then once a day. Never stops the server: a failed run is logged
// by type only, and the next one picks up what is left.
export function startDailyCleanup(accountingYearEnd: string, store: ImageStore | null) {
  const run = () => void runCleanup(retentionCutoffs(new Date(), accountingYearEnd), store)
    .then((counts) => console.log(`Data clean-up: deleted ${counts.contactRequests} contact requests, ${counts.unpaidOrders} unpaid orders, ${counts.paidOrders} paid orders, ${counts.files} files.`))
    .catch((error: unknown) => console.error(`Data clean-up failed (${error instanceof Error ? error.name : 'unknown error'}); it runs again tomorrow.`))
  setTimeout(run, FIRST_RUN_DELAY_MS).unref()
  setInterval(run, DAY_MS).unref()
}
