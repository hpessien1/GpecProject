import express, { Router } from 'express'
import type { RequestHandler } from 'express'
import { isDuplicateKeyError } from '../errors.js'
import WebhookEvent from '../models/WebhookEvent.js'
import { markOrderFailed, markOrderPaid } from '../services/checkout.js'
import type { Notifier } from '../services/notifications.js'
import { hasValidSignature, parseTransaction } from '../services/paystack.js'
import { asFields } from '../validation/fields.js'
import { PAYMENT_REFERENCE_PATTERN } from '../validation/checkout.js'

const HANDLED_EVENTS = ['charge.success', 'charge.failed']

// Paystack's server tells this one about payments (CLAUDE.md 4.1). Mounted in app.ts before
// express.json, because the signature covers the exact bytes Paystack sent. The body is parsed only
// after the signature checks out; anything unsigned or malformed gets a quiet 400.
export default function paystackWebhookRouter(secretKey: string | null, notifier: Notifier, limiter: RequestHandler) {
  const router = Router()

  router.post('/', limiter, express.raw({ type: 'application/json', limit: '64kb' }), async (req, res, next) => {
    if (!secretKey) return res.status(503).json({ message: 'Online payment is not available.', code: 'PAYMENT_CONFIG_ERROR' })
    const rawBody: unknown = req.body
    if (!Buffer.isBuffer(rawBody) || !hasValidSignature(rawBody, req.get('x-paystack-signature'), secretKey)) return res.status(400).json({ message: 'Invalid request.' })
    let payload: Record<string, unknown>
    try {
      payload = asFields(JSON.parse(rawBody.toString('utf8')))
    } catch {
      return res.status(400).json({ message: 'Invalid request.' })
    }
    const event = payload.event
    const data = asFields(payload.data)
    if (typeof event !== 'string' || event.length > 60) return res.status(400).json({ message: 'Invalid request.' })
    const transaction = parseTransaction(data)
    const transactionId = typeof data.id === 'number' || typeof data.id === 'string' ? String(data.id).slice(0, 40) : transaction?.reference.slice(0, 40) ?? 'none'
    const eventId = `${event}:${transactionId}`
    const isOrderPayment = HANDLED_EVENTS.includes(event) && transaction !== null && PAYMENT_REFERENCE_PATTERN.test(transaction.reference)

    let isRepeat = false
    try {
      // Recorded first, as received, and as processed only once the order is settled (audit M-07). A
      // repeated delivery hits the unique index: skipped if the work was done, done again if it never
      // finished (the server stopped in between, or it failed). Doing it twice is safe: markOrderPaid
      // and markOrderFailed change an order at most once.
      await WebhookEvent.create({ eventId, event, reference: isOrderPayment ? transaction.reference : '', outcome: isOrderPayment ? 'received' : 'ignored' })
    } catch (error) {
      if (!isDuplicateKeyError(error)) return next(error)
      isRepeat = true
    }
    if (!isOrderPayment) return res.status(200).json({ received: true })
    try {
      if (isRepeat && (await WebhookEvent.findOne({ eventId }).select('outcome').lean())?.outcome !== 'received') return res.status(200).json({ received: true })
      if (event === 'charge.success') await markOrderPaid(transaction, notifier)
      else await markOrderFailed(transaction.reference)
      await WebhookEvent.updateOne({ eventId }, { $set: { outcome: 'processed' } })
      return res.status(200).json({ received: true })
    } catch (error) {
      // Left as received, so Paystack's retry does the work again.
      return next(error)
    }
  })

  return router
}
