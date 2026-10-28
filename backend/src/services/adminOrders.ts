import mongoose from 'mongoose'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import AuditRecord from '../models/AuditRecord.js'
import Order, { FULFILMENT_STATUSES } from '../models/Order.js'
import type { FulfilmentStatus } from '../models/Order.js'
import Product from '../models/Product.js'
import { ADMIN_PAGE_SIZE, pageInfo, skipTo } from '../utils/paging.js'
import type { Cursor } from '../utils/paging.js'
import { searchFilter } from '../utils/search.js'
import type { AdminIdentity } from './adminAuth.js'
import { historyPage } from './auditHistory.js'
import { currencyInfo } from './currency.js'
import type { Notifier } from './notifications.js'
import { createNote, listNotes } from './staffNotes.js'

const SEARCH_FIELDS = ['reference', 'customer.fullName', 'customer.company', 'customer.email']

// Where an order stands, in one word for the admin list: unpaid orders by their payment status
// (bank transfers apart, as staff must check those themselves, first the ones the customer reported
// as sent), paid ones by their fulfilment status.
export const ORDER_STAGES = ['awaiting_payment', 'awaiting_transfer', 'transfer_reported', 'payment_failed', ...FULFILMENT_STATUSES] as const
export type OrderStage = typeof ORDER_STAGES[number]

interface StageSource {
  paymentStatus?: string | null
  fulfilmentStatus?: string | null
  paymentMethod?: string | null
  transferReported?: boolean
}

function stageOf(order: StageSource): OrderStage {
  if (order.paymentStatus === 'pending_payment' && order.paymentMethod === 'bank_transfer') return order.transferReported ? 'transfer_reported' : 'awaiting_transfer'
  if (order.paymentStatus === 'pending_payment') return 'awaiting_payment'
  if (order.paymentStatus === 'failed') return 'payment_failed'
  return (order.fulfilmentStatus ?? 'new') as FulfilmentStatus
}

function stageFilter(stage: OrderStage) {
  if (stage === 'awaiting_payment') return { paymentStatus: 'pending_payment', paymentMethod: { $ne: 'bank_transfer' } }
  if (stage === 'awaiting_transfer') return { paymentStatus: 'pending_payment', paymentMethod: 'bank_transfer', transferReportedAt: null }
  if (stage === 'transfer_reported') return { paymentStatus: 'pending_payment', paymentMethod: 'bank_transfer', transferReportedAt: { $ne: null } }
  if (stage === 'payment_failed') return { paymentStatus: 'failed' }
  return { paymentStatus: 'paid', fulfilmentStatus: stage }
}

// A delivery order is never "ready for pickup", and a pickup order is never "out for delivery".
function allowsStatus(method: string, status: FulfilmentStatus) {
  if (status === 'ready_for_pickup') return method === 'pickup'
  if (status === 'out_for_delivery') return method === 'delivery'
  return true
}

type StoredOrder = mongoose.InferSchemaType<typeof Order.schema> & { _id: mongoose.Types.ObjectId, createdAt: Date, updatedAt: Date }

function storedStage(order: StoredOrder): StageSource {
  return { paymentStatus: order.paymentStatus, fulfilmentStatus: order.fulfilmentStatus, paymentMethod: order.paymentMethod, transferReported: order.transferReportedAt != null }
}

function itemsSummary(order: StoredOrder) {
  const text = order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}

function toDetail(order: StoredOrder) {
  return {
    reference: order.reference,
    // Also the Paystack transaction reference, for looking the payment up in Paystack's dashboard.
    paymentReference: String(order._id),
    stage: stageOf(storedStage(order)),
    paymentMethod: order.paymentMethod ?? 'paystack',
    // The bank details the customer was given, and when they said they had paid.
    bankTransfer: order.bankTransfer ?? null,
    transferReportedAt: order.transferReportedAt ?? null,
    paymentStatus: order.paymentStatus,
    fulfilmentStatus: order.fulfilmentStatus,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    customer: { fullName: order.customer?.fullName ?? '', company: order.customer?.company ?? '', email: order.customer?.email ?? '', phone: order.customer?.phone ?? '' },
    fulfilmentMethod: order.fulfilmentMethod,
    deliveryAddress: order.deliveryAddress,
    deliveryAreaName: order.deliveryArea?.name ?? null,
    customerNotes: order.customerNotes ?? '',
    items: order.items.map(({ productId, name, reference, unitPrice, quantity, lineTotal }) => ({ productId, name, reference, unitPrice, quantity, lineTotal })),
    currency: currencyInfo(order.currency),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    paystackFee: order.paystackFee,
    total: order.total,
  }
}

// The order with the newest page of its history and of its notes; older pages come from the two
// functions after it.
export async function getOrder(reference: string) {
  const order: StoredOrder | null = await Order.findOne({ reference }).lean()
  if (!order) throw new NotFoundError('Order not found.')
  const [history, notes] = await Promise.all([historyPage('order', reference, null), listNotes('order', reference, null)])
  return { order: toDetail(order), ...history, ...notes }
}

export async function orderHistory(reference: string, before: Cursor | null) {
  if (!await Order.exists({ reference })) throw new NotFoundError('Order not found.')
  return historyPage('order', reference, before)
}

export async function orderNotes(reference: string, before: Cursor | null) {
  if (!await Order.exists({ reference })) throw new NotFoundError('Order not found.')
  return listNotes('order', reference, before)
}

// Newest first, optionally one stage only and matching a search, with a count per stage (of the
// matching orders) for the filter buttons.
export async function listOrders(page: number, stage: OrderStage | null, search: string) {
  const matching = searchFilter(search, SEARCH_FIELDS)
  const filter = stage ? { ...matching, ...stageFilter(stage) } : matching
  const [total, orders, grouped] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skipTo(page)).limit(ADMIN_PAGE_SIZE).lean<StoredOrder[]>(),
    Order.aggregate<{ _id: StageSource, count: number }>([{ $match: matching }, { $group: { _id: { paymentStatus: '$paymentStatus', fulfilmentStatus: '$fulfilmentStatus', paymentMethod: '$paymentMethod', transferReported: { $gt: ['$transferReportedAt', null] } }, count: { $sum: 1 } } }]),
  ])
  const counts = Object.fromEntries(ORDER_STAGES.map((name) => [name, 0])) as Record<OrderStage, number>
  for (const group of grouped) counts[stageOf(group._id)] += group.count
  return {
    items: orders.map((order) => ({
      reference: order.reference,
      stage: stageOf(storedStage(order)),
      paymentMethod: order.paymentMethod ?? 'paystack',
      createdAt: order.createdAt,
      name: order.customer?.fullName ?? '',
      company: order.customer?.company ?? '',
      email: order.customer?.email ?? '',
      summary: itemsSummary(order),
      fulfilmentMethod: order.fulfilmentMethod,
      total: order.total,
      currency: currencyInfo(order.currency),
    })),
    ...pageInfo(page, total),
    counts,
  }
}

// The statuses a customer can be emailed about, if staff choose to (the admin panel's checkbox).
export const CUSTOMER_UPDATE_STATUSES = ['ready_for_pickup', 'out_for_delivery', 'cancelled'] as const
type CustomerUpdateStatus = typeof CUSTOMER_UPDATE_STATUSES[number]
const isCustomerUpdate = (status: FulfilmentStatus): status is CustomerUpdateStatus => (CUSTOMER_UPDATE_STATUSES as readonly string[]).includes(status)

// Completed and cancelled are final: once an order reaches one, its status never changes again (the
// user's decision, 2026-10-28). The order screen asks staff to confirm before choosing one.
export const FINAL_STATUSES = ['completed', 'cancelled'] as const
const isFinal = (status: string | null | undefined) => (FINAL_STATUSES as readonly (string | null | undefined)[]).includes(status)

// A cancelled order gives back what its sale took from each product's stock count: exactly the
// amounts its product.sale records show (a sale never takes the count below 0, and products whose
// count is off, or demo orders, took nothing), recorded as product.restock under the admin who
// cancelled. A product whose count has been switched off since has nothing to add to.
async function returnStock(admin: AdminIdentity, reference: string, session: mongoose.ClientSession) {
  const sales = await AuditRecord.find({ action: 'product.sale', orderReference: reference }).session(session).lean()
  for (const sale of sales) {
    const change = sale.changes.find((entry) => entry.field === 'stockQuantity')
    const taken = Number(change?.from) - Number(change?.to)
    if (!Number.isInteger(taken) || taken <= 0) continue
    const product = await Product.findOne({ _id: sale.targetId, stockQuantity: { $ne: null } }).session(session).lean()
    if (!product || product.stockQuantity == null) continue
    const restored = product.stockQuantity + taken
    await Product.updateOne({ _id: product._id }, { $set: { stockQuantity: restored } }, { session })
    await AuditRecord.create([{
      action: 'product.restock',
      targetType: 'product',
      targetId: product._id,
      orderReference: reference,
      actor: { adminId: admin.id, email: admin.email, name: admin.name },
      changes: [{ field: 'stockQuantity', from: product.stockQuantity, to: restored }],
    }], { session })
  }
}

// Staff move a paid order along; payment status is never theirs to change. The change and its
// audit record are saved together. Setting the status it already has changes nothing; a completed or
// cancelled order cannot be changed (409 ORDER_CLOSED), and cancelling returns its stock.
// notifyCustomer: email the customer about it (only for CUSTOMER_UPDATE_STATUSES, and only while email
// is on). Sent after the change is saved, and recorded on the change so staff can see it was.
export async function setFulfilmentStatus(admin: AdminIdentity, reference: string, status: FulfilmentStatus, notifyCustomer: boolean, notifier: Notifier) {
  const emailCustomer = notifyCustomer && notifier.isOn && isCustomerUpdate(status)
  let changed = false
  await mongoose.connection.transaction(async (session) => {
    const before = await Order.findOne({ reference }).session(session)
    if (!before) throw new NotFoundError('Order not found.')
    if (before.paymentStatus !== 'paid') throw new ConflictError('Only paid orders can be moved along.', 'ORDER_NOT_PAID')
    if (!allowsStatus(before.fulfilmentMethod, status)) {
      const message = before.fulfilmentMethod === 'pickup' ? 'A pickup order cannot be out for delivery.' : 'A delivery order cannot be ready for pickup.'
      throw new ValidationError({ fulfilmentStatus: message }, message)
    }
    const from = before.fulfilmentStatus
    if (from === status) return
    if (isFinal(from)) throw new ConflictError(`This order is ${from} and can no longer be changed.`, 'ORDER_CLOSED')
    // Two staff changing it at once: the transaction makes the later one start again and read the new
    // status, so a cancellation returns the stock once (tested). The condition guards the same thing
    // should this ever run outside a transaction.
    const updated = await Order.updateOne({ reference, fulfilmentStatus: from }, { $set: { fulfilmentStatus: status } }, { session, runValidators: true })
    if (updated.matchedCount === 0) throw new ConflictError('The order was changed by someone else just now. Reload it and try again.', 'ORDER_CHANGED')
    if (status === 'cancelled') await returnStock(admin, reference, session)
    await AuditRecord.create([{
      action: 'order.status',
      targetType: 'order',
      targetId: reference,
      actor: { adminId: admin.id, email: admin.email, name: admin.name },
      changes: [{ field: 'fulfilmentStatus', from, to: status }],
      ...(emailCustomer ? { customerEmailed: true } : {}),
    }], { session })
    changed = true
  })
  if (changed && emailCustomer && isCustomerUpdate(status)) {
    const order = await Order.findOne({ reference }).lean()
    if (order?.customer) void notifier.orderUpdate({ ...order, customer: order.customer }, status)
  }
  return getOrder(reference)
}

export async function addOrderNote(admin: AdminIdentity, reference: string, text: string) {
  if (!await Order.exists({ reference })) throw new NotFoundError('Order not found.')
  await createNote(admin, 'order', reference, text)
  return getOrder(reference)
}
