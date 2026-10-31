import { NotFoundError, isDuplicateKeyError } from '../errors.js'
import mongoose from 'mongoose'
import AuditRecord from '../models/AuditRecord.js'
import UnmatchedPayment from '../models/UnmatchedPayment.js'
import type { AdminIdentity } from './adminAuth.js'
import type { UnmatchedPayment as UnmatchedPaymentDetails } from './emailTemplates.js'
import type { Notifier } from './notifications.js'

// An email that failed is tried again this long after its last try.
export const EMAIL_RETRY_MS = 15 * 60_000
// More than staff should ever have open; the oldest come first, so none is hidden for long.
const LIST_LIMIT = 50

// Saved before anything else, once per payment: a repeated message from Paystack changes nothing.
export async function recordUnmatchedPayment(payment: UnmatchedPaymentDetails) {
  try {
    await UnmatchedPayment.updateOne({ reference: payment.reference }, { $setOnInsert: payment }, { upsert: true })
  } catch (error) {
    // The same payment arriving twice at once: the other one saved it.
    if (!isDuplicateKeyError(error)) throw error
  }
}

// Emails staff about each saved payment not yet emailed. A try is claimed in the update that finds it,
// so two runs at once send one email. Stops when email is off; the Orders screen still lists them.
export async function emailWaitingUnmatchedPayments(notifier: Notifier, now = new Date()) {
  if (!notifier.isOn) return
  const retryBefore = new Date(now.getTime() - EMAIL_RETRY_MS)
  for (;;) {
    const payment = await UnmatchedPayment.findOneAndUpdate(
      { emailedAt: null, resolvedAt: null, $or: [{ emailTriedAt: null }, { emailTriedAt: { $lte: retryBefore } }] },
      { $set: { emailTriedAt: now } },
    ).lean()
    if (!payment) return
    const { reference, amount, currency, reason } = payment
    if (await notifier.paymentUnmatched({ reference, amount, currency, reason })) await UnmatchedPayment.updateOne({ reference }, { $set: { emailedAt: new Date() } })
  }
}

export async function listUnmatchedPayments() {
  const payments = await UnmatchedPayment.find({ resolvedAt: null }).sort({ createdAt: 1 }).limit(LIST_LIMIT).lean()
  return { items: payments.map(({ reference, reason, amount, currency, createdAt }) => ({ reference, reason, amount, currency, createdAt })) }
}

// Staff have dealt with it in Paystack's dashboard. The change and its record are saved together.
export async function resolveUnmatchedPayment(admin: AdminIdentity, reference: string) {
  await mongoose.connection.transaction(async (session) => {
    const { matchedCount } = await UnmatchedPayment.updateOne({ reference, resolvedAt: null }, { $set: { resolvedAt: new Date() } }, { session })
    if (matchedCount === 0) throw new NotFoundError('Payment not found.')
    await AuditRecord.create([{
      action: 'payment.resolve',
      targetType: 'unmatchedPayment',
      targetId: reference,
      actor: { adminId: admin.id, email: admin.email, name: admin.name },
      changes: [{ field: 'resolved', from: false, to: true }],
    }], { session })
  })
  return listUnmatchedPayments()
}
