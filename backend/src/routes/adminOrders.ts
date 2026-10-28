import { Router } from 'express'
import type { RequestHandler } from 'express'
import { NotFoundError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { securityEvent } from '../middleware/securityEvent.js'
import { addOrderNote, getOrder, listOrders, orderHistory, orderNotes, setFulfilmentStatus } from '../services/adminOrders.js'
import { checkPaymentForStaff, closeAbandonedPayment, closeUnpaidTransfer, confirmTransferReceived } from '../services/checkout.js'
import type { Notifier } from '../services/notifications.js'
import type { PaystackClient } from '../services/paystack.js'
import { ORDER_REFERENCE_PATTERN, validateFulfilmentChange, validateOrderListQuery, validateTransferClose } from '../validation/adminOrder.js'
import { validateNote } from '../validation/adminRequest.js'
import { validateOlderPageQuery } from '../validation/olderPage.js'

// Orders (/api/admin/orders) for GPEC staff. Mounted behind requireAdmin in app.ts: customers'
// details never reach an anonymous visitor. Admins can read and search orders, move a paid order's
// fulfilment along, and add internal notes. They cannot change items, amounts, or customer details.
// Payment status is set by the server: after Paystack confirms a payment (staff can ask Paystack
// themselves, and close an order the customer left without paying once Paystack confirms there is no
// payment), or, for a bank transfer, through the two recorded actions below (the money arrived, or it
// never did).
// confirmPassword (middleware/requirePassword.ts): marking a transfer received releases goods, so it
// needs the admin's password as well as the session. paystack: null while payments are not set up.
export default function adminOrdersRouter(notifier: Notifier, confirmPassword: RequestHandler, paystack: PaystackClient | null) {
  const router = Router()

  // unknown: with a middleware before it (confirmPassword), Express types the parameter more loosely.
  function referenceParam(reference: unknown) {
    if (typeof reference !== 'string' || !ORDER_REFERENCE_PATTERN.test(reference)) throw new NotFoundError('Order not found.')
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

  // An order as the detail screen shows it, with emailOn: whether customers can be told about changes,
  // and paystackOn: whether Paystack can be asked about a payment.
  async function detail(order: ReturnType<typeof getOrder>) {
    return { ...await order, emailOn: notifier.isOn, paystackOn: paystack !== null }
  }

  // Opening an order goes in the security log (audit M-06), by reference only.
  router.get('/:reference', securityEvent('record.order', { signedInOnly: true, target: (req) => ({ type: 'order', id: String(req.params.reference ?? '').slice(0, 60) }) }), async (req, res, next) => {
    try {
      return res.json(await detail(getOrder(referenceParam(req.params.reference))))
    } catch (error) {
      return next(error)
    }
  })

  // Older pages of an order's history and notes (the newest come with the order).
  for (const [path, olderPage] of [['history', orderHistory], ['notes', orderNotes]] as const) {
    router.get(`/:reference/${path}`, async (req, res, next) => {
      try {
        const reference = referenceParam(req.params.reference)
        const { errors, value } = validateOlderPageQuery(req.query)
        if (Object.keys(errors).length > 0) throw new ValidationError(errors)
        return res.json(await olderPage(reference, value.before))
      } catch (error) {
        return next(error)
      }
    })
  }

  router.patch('/:reference', async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      const { errors, value } = validateFulfilmentChange(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await detail(setFulfilmentStatus(currentAdmin(res), reference, value.fulfilmentStatus, value.notifyCustomer, notifier)))
    } catch (error) {
      return next(error)
    }
  })

  // Only the password (taken out by confirmPassword): what happened is in the route, and who did it
  // comes from the session. The customer is emailed that their order is paid, as after a Paystack payment.
  router.post('/:reference/transfer-received', confirmPassword, async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      if (Object.keys(req.body ?? {}).length > 0) throw new ValidationError({ body: 'Send no details.' })
      await confirmTransferReceived(currentAdmin(res), reference, notifier)
      return res.json(await detail(getOrder(reference)))
    } catch (error) {
      return next(error)
    }
  })

  // Ask Paystack about an unpaid Paystack order (audit M-07). No password: Paystack decides, not the
  // admin, and the answer is checked against the order's amount and currency as for the webhook.
  // close-payment: the customer left without paying, so staff close the order. Paystack is asked first:
  // the order closes only if it has no completed payment (otherwise it changes as with the check).
  for (const [path, ask] of [['check-payment', checkPaymentForStaff], ['close-payment', closeAbandonedPayment]] as const) {
    router.post(`/:reference/${path}`, async (req, res, next) => {
      try {
        const reference = referenceParam(req.params.reference)
        if (Object.keys(req.body ?? {}).length > 0) throw new ValidationError({ body: 'Send no details.' })
        const paymentCheck = await ask(currentAdmin(res), reference, paystack, notifier)
        return res.json({ ...await detail(getOrder(reference)), paymentCheck })
      } catch (error) {
        return next(error)
      }
    })
  }

  // Only { notifyCustomer? }: whether to tell the customer the order was closed.
  router.post('/:reference/transfer-not-received', async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      const { errors, value } = validateTransferClose(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      await closeUnpaidTransfer(currentAdmin(res), reference, notifier, value.notifyCustomer)
      return res.json(await detail(getOrder(reference)))
    } catch (error) {
      return next(error)
    }
  })

  router.post('/:reference/notes', async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      const { errors, value } = validateNote(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.status(201).json(await detail(addOrderNote(currentAdmin(res), reference, value.text)))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
