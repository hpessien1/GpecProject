import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import type { PaymentSettings, PaystackFeeRule } from '../config.js'
import { ConflictError, HttpError, NotFoundError } from '../errors.js'
import AuditRecord from '../models/AuditRecord.js'
import DeliveryArea from '../models/DeliveryArea.js'
import Order from '../models/Order.js'
import type { PaymentMethod } from '../models/Order.js'
import Product, { isInStock } from '../models/Product.js'
import { createReference } from '../utils/reference.js'
import type { BasketInput, OrderInput } from '../validation/checkout.js'
import { currencyInfo } from './currency.js'
import type { AdminIdentity } from './adminAuth.js'
import type { BankTransferDetails } from './bankTransfer.js'
import type { Notifier } from './notifications.js'
import { PaystackError } from './paystack.js'
import type { PaystackClient, TransactionResult } from './paystack.js'
import { paystackFeeFor } from './paystackFee.js'

// The order flow (CLAUDE.md Sections 4.1 and 8): the server prices the basket from its own data and
// creates the order unpaid. Paystack orders start a Paystack payment and become paid only in
// markOrderPaid, after Paystack confirms it, whichever way the confirmation arrives. Bank-transfer
// orders give the customer GPEC's account details and become paid only when staff confirm the money
// arrived (confirmTransferReceived). Both end in the same settleOrder.

export interface PricedBasket {
  items: { productId: string, name: string, reference: string, unitPrice: number, quantity: number, lineTotal: number }[]
  fulfilmentMethod: BasketInput['fulfilmentMethod']
  deliveryArea: { areaId: string, name: string } | null
  currency: string
  subtotal: number
  deliveryFee: number
  paystackFee: number
  total: number
}

// A refusal about specific products: the message names them, errors gives one message per product ID.
function basketError(code: string, message: string, products: { id: string, name: string }[], perProduct: string) {
  return new HttpError(409, message, code, Object.fromEntries(products.map((product) => [product.id, perProduct])))
}

function names(products: { name: string }[]) {
  return products.map((product) => product.name).join(', ')
}

// Prices the basket from the products collection and the chosen delivery area. Refuses products that
// are unknown, archived, unpriced, out of stock, short of the quantity, or (for delivery) pickup-only.
// feeRule: Paystack's fee for a Paystack payment; null for a bank transfer, which has no such fee.
export async function priceBasket(basket: BasketInput, currency: string, feeRule: PaystackFeeRule | null): Promise<PricedBasket> {
  const ids = basket.items.map((item) => item.productId)
  const products = await Product.find({ _id: { $in: ids }, status: 'active' }).lean()
  const byId = new Map(products.map((product) => [product._id, product]))

  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    throw new HttpError(409, 'Some products in your cart are no longer sold. Remove them and try again.', 'PRODUCT_UNAVAILABLE', Object.fromEntries(missing.map((id) => [id, 'No longer sold.'])))
  }
  const listed = basket.items.map((item) => ({ ...item, product: byId.get(item.productId)! }))
  const outOfStock = listed.filter(({ product }) => !isInStock(product)).map(({ product }) => ({ id: product._id, name: product.name }))
  if (outOfStock.length > 0) throw basketError('OUT_OF_STOCK', `Out of stock: ${names(outOfStock)}. Remove ${outOfStock.length === 1 ? 'it' : 'them'} from your cart to continue.`, outOfStock, 'Out of stock.')
  // The count itself stays private (customers see only in stock or out of stock).
  const short = listed.filter(({ product, quantity }) => product.stockQuantity != null && quantity > product.stockQuantity).map(({ product }) => ({ id: product._id, name: product.name }))
  if (short.length > 0) throw basketError('NOT_ENOUGH_STOCK', `GPEC cannot supply the quantity you chose of: ${names(short)}. Lower the quantity, or contact GPEC to ask.`, short, 'Not enough in stock for this quantity.')
  const unpriced = listed.filter(({ product }) => product.price == null).map(({ product }) => ({ id: product._id, name: product.name }))
  if (unpriced.length > 0) throw basketError('PRICE_NOT_SET', `These products have no price yet and cannot be bought online: ${names(unpriced)}. Contact GPEC to ask about them.`, unpriced, 'No price yet.')

  let deliveryArea: PricedBasket['deliveryArea'] = null
  let deliveryFee = 0
  if (basket.fulfilmentMethod === 'delivery') {
    const pickupOnly = listed.filter(({ product }) => product.deliveryAvailable === false).map(({ product }) => ({ id: product._id, name: product.name }))
    if (pickupOnly.length > 0) throw basketError('PICKUP_ONLY', `GPEC does not deliver: ${names(pickupOnly)}. Choose pickup, or remove ${pickupOnly.length === 1 ? 'it' : 'them'} to have the rest delivered.`, pickupOnly, 'Pickup only.')
    const area = basket.deliveryAreaId ? await DeliveryArea.findOne({ _id: basket.deliveryAreaId, status: 'active' }).lean() : null
    if (!area) throw new HttpError(409, 'GPEC no longer delivers to the area you chose. Choose another area or pickup.', 'DELIVERY_AREA_UNAVAILABLE', { deliveryAreaId: 'Choose another area.' })
    deliveryArea = { areaId: String(area._id), name: area.name }
    deliveryFee = area.fee
  }

  const items = listed.map(({ product, quantity }) => {
    const unitPrice = product.price as number
    return { productId: product._id, name: product.name, reference: product.reference, unitPrice, quantity, lineTotal: unitPrice * quantity }
  })
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  const paystackFee = feeRule ? paystackFeeFor(subtotal + deliveryFee, feeRule) : 0
  const total = subtotal + deliveryFee + paystackFee
  if (!Number.isSafeInteger(total)) throw new HttpError(409, 'This order is too large to pay online. Contact GPEC to arrange it.', 'ORDER_TOO_LARGE')
  if (total <= 0) throw new HttpError(409, 'There is nothing to pay for this order. Contact GPEC to arrange it.', 'ORDER_TOTAL_ZERO')
  return { items, fulfilmentMethod: basket.fulfilmentMethod, deliveryArea, currency, subtotal, deliveryFee, paystackFee, total }
}

// The amounts the customer sees before paying, from the same calculation the order uses.
export function toQuote(priced: PricedBasket) {
  const { items, deliveryArea, currency, subtotal, deliveryFee, paystackFee, total } = priced
  return { items, deliveryAreaName: deliveryArea?.name ?? null, currency: currencyInfo(currency), subtotal, deliveryFee, paystackFee, total }
}

// The order's _id is its payment reference, and anyone holding it can open the payment result page.
// Fully random (unlike a default ObjectId, which counts up), so one order's ID does not lead to another's.
function randomOrderId() {
  return new mongoose.Types.ObjectId(randomBytes(12))
}

function orderFields(input: OrderInput, priced: PricedBasket, paymentMethod: PaymentMethod) {
  return {
    _id: randomOrderId(),
    reference: createReference('GPEC-O'),
    customer: input.customer,
    items: priced.items,
    fulfilmentMethod: priced.fulfilmentMethod,
    deliveryAddress: priced.fulfilmentMethod === 'delivery' ? input.deliveryAddress : '',
    deliveryArea: priced.deliveryArea,
    customerNotes: input.notes,
    currency: priced.currency,
    subtotal: priced.subtotal,
    deliveryFee: priced.deliveryFee,
    paystackFee: priced.paystackFee,
    total: priced.total,
    paymentMethod,
  }
}

// Create, then initialize, then roll back on failure (CLAUDE.md 4.1): no unpaid order is left behind
// when Paystack does not start the payment. Each call is a new order with its own reference; an
// abandoned one stays "Awaiting payment" for staff to see, and the customer's cart is kept to try again.
export async function startPaystackOrder(input: OrderInput, currency: string, payments: PaymentSettings, paystack: PaystackClient) {
  const priced = await priceBasket(input, currency, payments.fee)
  const order = await Order.create(orderFields(input, priced, 'paystack'))
  const paymentReference = String(order._id)
  try {
    const { authorizationUrl } = await paystack.initialize({
      reference: paymentReference,
      email: input.customer.email,
      amount: priced.total,
      currency: priced.currency,
      // Built here, never taken from the request (CLAUDE.md 4.1). main.tsx turns this path into the
      // payment result screen; Paystack adds ?trxref=…&reference=… to it.
      callbackUrl: `${payments.siteUrl}/shop/payment-complete`,
      orderReference: order.reference,
    })
    return { reference: order.reference, paymentMethod: 'paystack' as const, authorizationUrl }
  } catch (error) {
    await Order.deleteOne({ _id: order._id, paymentStatus: 'pending_payment' })
    if (error instanceof PaystackError) {
      console.error(`Payment for ${order.reference} could not be started; the order was removed. ${error.message}`)
      throw new HttpError(502, 'The payment could not be started. Nothing was charged. Please try again in a moment.', 'PAYMENT_START_FAILED')
    }
    throw error
  }
}

// A bank-transfer order: saved unpaid with a copy of the account details the customer is given, which
// the result page and the emails show. No Paystack fee: Paystack is not involved.
export async function placeTransferOrder(input: OrderInput, currency: string, bank: BankTransferDetails, notifier: Notifier) {
  const priced = await priceBasket(input, currency, null)
  const order = await Order.create({ ...orderFields(input, priced, 'bank_transfer'), bankTransfer: bank })
  const saved = await Order.findById(order._id).lean()
  if (saved?.customer) void notifier.transferOrderPlaced({ ...saved, customer: saved.customer })
  return { reference: order.reference, paymentMethod: 'bank_transfer' as const, paymentReference: String(order._id) }
}

type StoredOrder = NonNullable<Awaited<ReturnType<typeof findOrder>>>
type Session = mongoose.ClientSession

// Marks an unpaid (or failed) order paid, at most once: the conditional update lets only one caller
// win. The winner reduces counted stock (never below 0, each change recorded) and sends the paid
// emails. record: an extra audit record written in the same transaction (staff confirming a transfer,
// or asking Paystack), given the status the order was paid from. from: the statuses it may be paid
// from; a Paystack retry can succeed after a failed attempt, but a transfer staff closed as not
// received stays closed.
async function settleOrder(order: StoredOrder, notifier: Notifier, from: string[], record?: (session: Session, paidFrom: string) => Promise<unknown>) {
  let won = false
  await mongoose.connection.transaction(async (session) => {
    won = false
    // Never from paid: status only moves forward. Returns the order as it was, or null if it was not
    // in one of those statuses.
    const before = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: { $in: from } }, { $set: { paymentStatus: 'paid', paidAt: new Date() } }, { session, projection: { paymentStatus: 1 } }).lean()
    if (!before) return
    won = true
    await record?.(session, before.paymentStatus ?? 'pending_payment')
    for (const item of order.items) {
      const product = await Product.findOne({ _id: item.productId, stockQuantity: { $ne: null } }).session(session).lean()
      if (!product || product.stockQuantity == null) continue
      // Never below 0: if stock ran out while the customer was paying, staff see 0 and the order.
      const remaining = Math.max(0, product.stockQuantity - item.quantity)
      await Product.updateOne({ _id: product._id }, { $set: { stockQuantity: remaining } }, { session })
      await AuditRecord.create([{
        action: 'product.sale',
        targetType: 'product',
        targetId: product._id,
        orderReference: order.reference,
        changes: [{ field: 'stockQuantity', from: product.stockQuantity, to: remaining }],
      }], { session })
    }
  })
  if (!won) return false
  const paid = await Order.findById(order._id).lean()
  if (paid?.customer) void notifier.orderPaid({ ...paid, customer: paid.customer })
  return true
}

type PaidOutcome = 'paid' | 'already_paid' | 'not_successful' | 'mismatch' | 'unknown_order'

// The one function that marks a Paystack order paid, used by the webhook, the return-page check, and
// staff asking Paystack (CLAUDE.md 4.1). Paystack must report success with exactly the order's amount
// and currency. record: as in settleOrder (staff asked).
export async function markOrderPaid(result: TransactionResult, notifier: Notifier, record?: (session: Session, paidFrom: string) => Promise<unknown>): Promise<PaidOutcome> {
  if (!mongoose.isObjectIdOrHexString(result.reference)) return 'unknown_order'
  const order = await findOrder(result.reference)
  // A bank-transfer order never had a Paystack transaction: a charge naming it is not its payment.
  if (!order || order.paymentMethod === 'bank_transfer') return 'unknown_order'
  if (order.paymentStatus === 'paid') return 'already_paid'
  if (result.status !== 'success') return 'not_successful'
  if (result.amount !== order.total || result.currency !== order.currency) {
    // Logged as a server error for staff to look into: someone may have tampered with the payment.
    console.error(`Payment for ${order.reference} does not match the order (amount or currency differ); it was not marked paid.`)
    return 'mismatch'
  }
  return await settleOrder(order, notifier, ['pending_payment', 'failed'], record) ? 'paid' : 'already_paid'
}

// Paystack reported a failed charge. Only an unpaid order changes: a late or repeated failure never
// moves a paid order back (CLAUDE.md 4.1). record: written in the same transaction, only if the order
// changed (staff asked). True when it changed.
export async function markOrderFailed(reference: string, record?: (session: Session) => Promise<unknown>) {
  if (!mongoose.isObjectIdOrHexString(reference)) return false
  let changed = false
  await mongoose.connection.transaction(async (session) => {
    const update = await Order.updateOne({ _id: reference, paymentMethod: { $ne: 'bank_transfer' }, paymentStatus: 'pending_payment' }, { $set: { paymentStatus: 'failed' } }, { session })
    changed = update.matchedCount === 1
    if (changed) await record?.(session)
  })
  return changed
}

function actorOf(admin: AdminIdentity) {
  return { adminId: admin.id, email: admin.email, name: admin.name }
}

function paymentRecord(admin: AdminIdentity, reference: string, from: string, to: string) {
  return (session: Session) => AuditRecord.create([{ action: 'order.payment', targetType: 'order', targetId: reference, actor: actorOf(admin), changes: [{ field: 'paymentStatus', from, to }] }], { session })
}

// What staff asking Paystack found: paid (now), already_paid (before asking), failed (Paystack reports
// a failed payment), not_paid (unfinished or abandoned), not_found (the customer never reached
// Paystack's page), mismatch (a payment that does not match the order; not marked paid). Closing an
// abandoned order adds closed (Paystack had no completed payment, so staff closed it) and
// already_closed (Paystack marked it failed while being asked).
export type PaymentCheckOutcome = 'paid' | 'already_paid' | 'failed' | 'not_paid' | 'not_found' | 'mismatch' | 'closed' | 'already_closed'

// Audit M-07: a payment Paystack took that the site never heard about (the webhook's work was cut
// off, and the customer closed the tab before the return-page check). Staff ask Paystack; the order
// changes only on Paystack's word, through the same markOrderPaid, recorded with who asked.
export function checkPaymentForStaff(admin: AdminIdentity, reference: string, paystack: PaystackClient | null, notifier: Notifier) {
  return askPaystackForStaff(admin, reference, paystack, notifier, false)
}

// The customer left Paystack's page without paying: staff close the order so it no longer waits for
// payment. Paystack is asked first, so an order it has a payment for becomes paid (or failed) instead,
// as with the check. The order becomes failed, recorded as order.close; the customer is not emailed. A
// payment the customer still finishes later marks it paid all the same (markOrderPaid pays failed orders).
export function closeAbandonedPayment(admin: AdminIdentity, reference: string, paystack: PaystackClient | null, notifier: Notifier) {
  return askPaystackForStaff(admin, reference, paystack, notifier, true)
}

async function askPaystackForStaff(admin: AdminIdentity, reference: string, paystack: PaystackClient | null, notifier: Notifier, closeIfUnpaid: boolean): Promise<PaymentCheckOutcome> {
  const order = await Order.findOne({ reference }).lean()
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentMethod === 'bank_transfer') throw new ConflictError('This order is paid by bank transfer: check GPEC’s bank account instead.', 'NOT_A_PAYSTACK_ORDER')
  if (order.paymentStatus === 'paid') return 'already_paid'
  if (closeIfUnpaid && order.paymentStatus !== 'pending_payment') throw new ConflictError('This order is no longer awaiting payment.', 'PAYMENT_ALREADY_CLOSED')
  if (!paystack) throw new HttpError(503, 'Online payment is not set up, so Paystack cannot be asked.', 'PAYMENT_CONFIG_ERROR')
  const paymentReference = String(order._id)
  let result: TransactionResult | null
  try {
    result = await paystack.verify(paymentReference)
  } catch (error) {
    if (!(error instanceof PaystackError)) throw error
    console.error(`Payment for ${order.reference} could not be checked. ${error.message}`)
    throw new HttpError(502, 'Paystack could not be reached just now. Nothing changed; try again in a moment.', 'PAYMENT_CHECK_FAILED')
  }
  if (!result || result.reference !== paymentReference) return closeIfUnpaid ? await closeUnpaid(admin, reference, paymentReference) : 'not_found'
  if (result.status === 'success') {
    const outcome = await markOrderPaid(result, notifier, (session, paidFrom) => paymentRecord(admin, reference, paidFrom, 'paid')(session))
    return outcome === 'mismatch' ? 'mismatch' : outcome === 'paid' ? 'paid' : 'already_paid'
  }
  if (result.status === 'failed') {
    await markOrderFailed(paymentReference, paymentRecord(admin, reference, 'pending_payment', 'failed'))
    return 'failed'
  }
  return closeIfUnpaid ? await closeUnpaid(admin, reference, paymentReference) : 'not_paid'
}

async function closeUnpaid(admin: AdminIdentity, reference: string, paymentReference: string): Promise<PaymentCheckOutcome> {
  const closed = await markOrderFailed(paymentReference, (session) => AuditRecord.create([{ action: 'order.close', targetType: 'order', targetId: reference, actor: actorOf(admin), changes: [{ field: 'paymentStatus', from: 'pending_payment', to: 'failed' }] }], { session }))
  if (closed) return 'closed'
  // Settled while Paystack was being asked: its webhook, or another admin.
  const now = await Order.findOne({ reference }).select('paymentStatus').lean()
  return now?.paymentStatus === 'paid' ? 'already_paid' : 'already_closed'
}

async function unpaidTransfer(reference: string) {
  const order = await Order.findOne({ reference }).lean()
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentMethod !== 'bank_transfer') throw new ConflictError('This order is paid through Paystack, which confirms its payment itself.', 'NOT_A_TRANSFER')
  if (order.paymentStatus !== 'pending_payment') throw new ConflictError(order.paymentStatus === 'paid' ? 'This order is already paid.' : 'This order was closed as not received.', 'TRANSFER_ALREADY_SETTLED')
  return order
}

// Staff have checked GPEC's bank account and the full amount arrived. Recorded (who and when) in the
// same transaction as the payment itself.
export async function confirmTransferReceived(admin: AdminIdentity, reference: string, notifier: Notifier) {
  const order = await unpaidTransfer(reference)
  const settled = await settleOrder(order, notifier, ['pending_payment'], (session) => AuditRecord.create([{
    action: 'order.payment',
    targetType: 'order',
    targetId: reference,
    actor: actorOf(admin),
    changes: [{ field: 'paymentStatus', from: 'pending_payment', to: 'paid' }],
  }], { session }))
  if (!settled) throw new ConflictError('This order is no longer awaiting a transfer.', 'TRANSFER_ALREADY_SETTLED')
}

// The transfer never arrived: staff close the order. Nothing was paid, so nothing else changes.
// notifyCustomer: tell the customer by email (while email is on), after the change is saved.
export async function closeUnpaidTransfer(admin: AdminIdentity, reference: string, notifier: Notifier, notifyCustomer: boolean) {
  const order = await unpaidTransfer(reference)
  const emailCustomer = notifyCustomer && notifier.isOn
  await mongoose.connection.transaction(async (session) => {
    const update = await Order.updateOne({ reference, paymentMethod: 'bank_transfer', paymentStatus: 'pending_payment' }, { $set: { paymentStatus: 'failed' } }, { session })
    if (update.modifiedCount !== 1) throw new ConflictError('This order is no longer awaiting a transfer.', 'TRANSFER_ALREADY_SETTLED')
    await AuditRecord.create([{ action: 'order.payment', targetType: 'order', targetId: reference, actor: actorOf(admin), changes: [{ field: 'paymentStatus', from: 'pending_payment', to: 'failed' }], ...(emailCustomer ? { customerEmailed: true } : {}) }], { session })
  })
  if (emailCustomer && order.customer) void notifier.orderUpdate({ ...order, customer: order.customer }, 'transfer_not_received')
}

// The customer says they have sent the transfer. Recorded once, with one email to staff; it changes
// nothing else, because only staff can see whether the money arrived.
export async function reportTransferSent(paymentReference: string, notifier: Notifier) {
  const order = await findOrder(paymentReference)
  if (!order || order.paymentMethod !== 'bank_transfer') throw new NotFoundError('Order not found.')
  if (order.paymentStatus === 'pending_payment') {
    const update = await Order.updateOne({ _id: order._id, paymentStatus: 'pending_payment', transferReportedAt: null }, { $set: { transferReportedAt: new Date() } })
    if (update.modifiedCount === 1 && order.customer) void notifier.transferReported({ ...order, customer: order.customer })
  }
  const latest = await findOrder(paymentReference)
  if (!latest) throw new NotFoundError('Order not found.')
  return toPaymentResult(latest)
}

const DAY = 24 * 60 * 60 * 1000

// What the payment result page shows: no names, email, phone, or address, because the link (with
// the payment reference) is all it takes to open it. GPEC's bank details are not private: checkout
// shows them to anyone.
function toPaymentResult(order: StoredOrder) {
  const transfer = order.paymentMethod === 'bank_transfer' && order.bankTransfer
    ? { ...order.bankTransfer, payBy: new Date(order.createdAt.getTime() + order.bankTransfer.payWithinDays * DAY), reportedAt: order.transferReportedAt ?? null }
    : null
  return {
    reference: order.reference,
    paymentMethod: order.paymentMethod ?? 'paystack',
    paymentStatus: order.paymentStatus,
    paidAt: order.paidAt,
    fulfilmentMethod: order.fulfilmentMethod,
    deliveryAreaName: order.deliveryArea?.name ?? null,
    items: order.items.map(({ productId, name, reference, unitPrice, quantity, lineTotal }) => ({ productId, name, reference, unitPrice, quantity, lineTotal })),
    currency: currencyInfo(order.currency),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    paystackFee: order.paystackFee,
    total: order.total,
    bankTransfer: transfer,
  }
}

function findOrder(paymentReference: string) {
  return Order.findById(paymentReference).lean()
}

// The customer is back from Paystack, or looking at a bank-transfer order. For Paystack, landing here
// proves nothing, so the server asks Paystack itself and runs the same markOrderPaid as the webhook.
// paystack: null while Paystack is not configured (bank-transfer orders still show).
export async function checkPayment(paymentReference: string, paystack: PaystackClient | null, notifier: Notifier) {
  const order = await findOrder(paymentReference)
  if (!order) throw new NotFoundError('Order not found.')
  if (order.paymentStatus === 'paid' || order.paymentMethod === 'bank_transfer' || !paystack) return toPaymentResult(order)
  let result: TransactionResult | null
  try {
    result = await paystack.verify(paymentReference)
  } catch (error) {
    if (!(error instanceof PaystackError)) throw error
    console.error(`Payment for ${order.reference} could not be checked. ${error.message}`)
    throw new HttpError(502, 'The payment could not be checked just now. Please try again in a moment.', 'PAYMENT_CHECK_FAILED')
  }
  if (result && result.reference === paymentReference) {
    if (result.status === 'success') await markOrderPaid(result, notifier)
    else if (result.status === 'failed') await markOrderFailed(paymentReference)
  }
  const latest = await findOrder(paymentReference)
  if (!latest) throw new NotFoundError('Order not found.')
  return toPaymentResult(latest)
}
