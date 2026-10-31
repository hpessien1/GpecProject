import { Router } from 'express'
import { NotFoundError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { listUnmatchedPayments, resolveUnmatchedPayment } from '../services/unmatchedPayments.js'
import { PAYMENT_REFERENCE_PATTERN } from '../validation/checkout.js'

// Completed Paystack payments the website could not match to an order
// (/api/admin/unmatched-payments), behind requireAdmin in app.ts.
export default function adminUnmatchedPaymentsRouter() {
  const router = Router()

  router.get('/', async (_req, res, next) => {
    try {
      return res.json(await listUnmatchedPayments())
    } catch (error) {
      return next(error)
    }
  })

  router.post('/:reference/resolve', async (req, res, next) => {
    try {
      const { reference } = req.params
      if (!PAYMENT_REFERENCE_PATTERN.test(reference)) throw new NotFoundError('Payment not found.')
      return res.json(await resolveUnmatchedPayment(currentAdmin(res), reference))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
