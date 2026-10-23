import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import type { RequestHandler } from 'express'
import type { AppConfig } from '../app.js'
import { HttpError, NotFoundError, ValidationError } from '../errors.js'
import { BANK_TRANSFER_CURRENCY, activeBankTransfer } from '../services/bankTransfer.js'
import { checkPayment, placeTransferOrder, priceBasket, reportTransferSent, startPaystackOrder, toQuote } from '../services/checkout.js'
import { currencyInfo } from '../services/currency.js'
import { listActiveDeliveryAreas } from '../services/deliveryAreas.js'
import type { Notifier } from '../services/notifications.js'
import type { PaystackClient } from '../services/paystack.js'
import { PAYMENT_REFERENCE_PATTERN, validateBasket, validateOrder } from '../validation/checkout.js'
import { isLikelySpam } from '../validation/fields.js'
import { createReference } from '../utils/reference.js'

interface CheckoutLimiters {
  read: RequestHandler
  order: RequestHandler
}

// The shop's checkout (/api/checkout). The browser sends only product IDs, quantities, the pickup or
// delivery choice, the payment method, and the customer's details; every amount comes from the server
// (CLAUDE.md 4.1). Two ways to pay: Paystack (when its settings are configured) and bank transfer
// (when staff have entered GPEC's bank details and switched it on). Both need the currency.
export default function checkoutRouter(config: AppConfig, paystack: PaystackClient | null, notifier: Notifier, limit: CheckoutLimiters) {
  const router = Router()
  const { payments, currency } = config

  const paystackReady = Boolean(payments && paystack && currency)

  // Which ways to pay are open now. Bank transfer depends on staff's settings, so it is read each time.
  // The details are a Nigerian account (10-digit NUBAN), which takes naira only, so bank transfer is
  // offered only while the shop's currency is NGN.
  async function methods() {
    const bank = currency === BANK_TRANSFER_CURRENCY ? await activeBankTransfer() : null
    return { paystack: paystackReady, bank }
  }

  function unavailable() {
    return new HttpError(503, 'Online payment is not available yet.', 'PAYMENT_CONFIG_ERROR')
  }

  // The Paystack fee rule for a Paystack payment, or null for a bank transfer; refuses a method that is off.
  async function feeRuleFor(method: 'paystack' | 'bank_transfer') {
    const open = await methods()
    if (!currency) throw unavailable()
    if (method === 'paystack') {
      if (!open.paystack || !payments) throw new HttpError(503, 'Paying through Paystack is not available. Choose bank transfer instead.', 'PAYMENT_CONFIG_ERROR')
      return { currency, feeRule: payments.fee, bank: null }
    }
    if (!open.bank) throw new HttpError(503, 'Bank transfer is not available. Choose Paystack instead.', 'BANK_TRANSFER_UNAVAILABLE')
    return { currency, feeRule: null, bank: open.bank }
  }

  // Which ways to pay are open (Paystack in test mode?), GPEC's bank details for transfers, and the
  // delivery areas with their fees.
  router.get('/', limit.read, async (_req, res, next) => {
    try {
      const open = await methods()
      const paymentMethods = [...(open.paystack ? ['paystack'] : []), ...(open.bank ? ['bank_transfer'] : [])]
      const paymentsAvailable = paymentMethods.length > 0
      return res.json({
        paymentsAvailable,
        paymentMethods,
        testMode: open.paystack && payments?.testMode === true,
        currency: currencyInfo(currency),
        bankTransfer: open.bank,
        deliveryAreas: paymentsAvailable ? await listActiveDeliveryAreas() : [],
      })
    } catch (error) {
      return next(error)
    }
  })

  // The order summary before paying: the same calculation the order itself uses.
  router.post('/quote', limit.read, async (req, res, next) => {
    try {
      const { errors, value } = validateBasket(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const setup = await feeRuleFor(value.paymentMethod)
      return res.json(toQuote(await priceBasket(value, setup.currency, setup.feeRule)))
    } catch (error) {
      return next(error)
    }
  })

  // Creates the order. Paystack: answers with Paystack's payment page, where the browser goes next.
  // Bank transfer: answers with the payment reference, whose result page shows how to pay.
  router.post('/orders', limit.order, async (req, res, next) => {
    try {
      // Looks like success to a script (CLAUDE.md 4.7): nothing is saved and no payment starts.
      if (isLikelySpam(req.body)) {
        console.info('Discarded a likely spam order (spam trap field filled in).')
        if (!currency) throw unavailable()
        return res.status(201).json({ reference: createReference('GPEC-O'), paymentMethod: 'bank_transfer', paymentReference: randomBytes(12).toString('hex') })
      }
      const { errors, value } = validateOrder(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const setup = await feeRuleFor(value.paymentMethod)
      if (setup.bank) return res.status(201).json(await placeTransferOrder(value, setup.currency, setup.bank, notifier))
      if (!payments || !paystack) throw unavailable()
      return res.status(201).json(await startPaystackOrder(value, setup.currency, payments, paystack))
    } catch (error) {
      return next(error)
    }
  })

  function paymentReferenceParam(reference: unknown) {
    if (typeof reference !== 'string' || !PAYMENT_REFERENCE_PATTERN.test(reference)) throw new NotFoundError('Order not found.')
    return reference
  }

  // The payment result page asks here: after Paystack sends the customer back, or for a bank transfer.
  router.get('/orders/:paymentReference', limit.read, async (req, res, next) => {
    try {
      const reference = paymentReferenceParam(req.params.paymentReference)
      res.set('Cache-Control', 'no-store')
      return res.json(await checkPayment(reference, paystackReady ? paystack : null, notifier))
    } catch (error) {
      return next(error)
    }
  })

  // "I have sent the transfer": staff are told once; staff still confirm the money arrived.
  router.post('/orders/:paymentReference/transfer-sent', limit.order, async (req, res, next) => {
    try {
      const reference = paymentReferenceParam(req.params.paymentReference)
      if (Object.keys(req.body ?? {}).length > 0) throw new ValidationError({ body: 'Send no details.' })
      res.set('Cache-Control', 'no-store')
      return res.json(await reportTransferSent(reference, notifier))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
