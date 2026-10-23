import { Router } from 'express'
import { NotFoundError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { addOrderNote, getOrder, listOrders, setFulfilmentStatus } from '../services/adminOrders.js'
import { closeUnpaidTransfer, confirmTransferReceived } from '../services/checkout.js'
import type { Notifier } from '../services/notifications.js'
import { ORDER_REFERENCE_PATTERN, validateFulfilmentChange, validateOrderListQuery } from '../validation/adminOrder.js'
import { validateNote } from '../validation/adminRequest.js'

// Orders (/api/admin/orders) for GPEC staff. Mounted behind requireAdmin in app.ts: customers'
// details never reach an anonymous visitor. Admins can read and search orders, move a paid order's
// fulfilment along, and add internal notes. They cannot change items, amounts, or customer details.
// Payment status is set by the server: after Paystack confirms a payment, or, for a bank transfer,
// through the two recorded actions below (the money arrived, or it never did).
export default function adminOrdersRouter(notifier: Notifier) {
  const router = Router()

  function referenceParam(reference: string | undefined) {
    if (!reference || !ORDER_REFERENCE_PATTERN.test(reference)) throw new NotFoundError('Order not found.')
    return reference
  }

  router.get('/', async (req, res, next) => {
    try {
      const { errors, value } = validateOrderListQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await listOrders(value.page, value.stage, value.search))
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:reference', async (req, res, next) => {
    try {
      return res.json(await getOrder(referenceParam(req.params.reference)))
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/:reference', async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      const { errors, value } = validateFulfilmentChange(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await setFulfilmentStatus(currentAdmin(res), reference, value.fulfilmentStatus))
    } catch (error) {
      return next(error)
    }
  })

  // Both take no body: what happened is in the route, and who did it comes from the session.
  for (const [path, action] of [['transfer-received', confirmTransferReceived], ['transfer-not-received', closeUnpaidTransfer]] as const) {
    router.post(`/:reference/${path}`, async (req, res, next) => {
      try {
        const reference = referenceParam(req.params.reference)
        if (Object.keys(req.body ?? {}).length > 0) throw new ValidationError({ body: 'Send no details.' })
        await action(currentAdmin(res), reference, notifier)
        return res.json(await getOrder(reference))
      } catch (error) {
        return next(error)
      }
    })
  }

  router.post('/:reference/notes', async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      const { errors, value } = validateNote(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.status(201).json(await addOrderNote(currentAdmin(res), reference, value.text))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
