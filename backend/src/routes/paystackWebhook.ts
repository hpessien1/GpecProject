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

    try {
      // Recorded first: a repeated delivery hits the unique index and is skipped.
      await WebhookEvent.create({ eventId, event, reference: isOrderPayment ? transaction.reference : '', outcome: isOrderPayment ? 'processed' : 'ignored' })
    } catch (error) {
      if (isDuplicateKeyError(error)) return res.status(200).json({ received: true })
      return next(error)
    }
    if (!isOrderPayment) return res.status(200).json({ received: true })
    try {
      if (event === 'charge.success') await markOrderPaid(transaction, notifier)
      else await markOrderFailed(transaction.reference)
      return res.status(200).json({ received: true })
    } catch (error) {
      // Forget the event so Paystack's retry is processed rather than skipped.
      await WebhookEvent.deleteOne({ eventId }).catch(() => undefined)
      return next(error)
    }
  })

  return router
}
