import mongoose from 'mongoose'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import AuditRecord from '../models/AuditRecord.js'
import Order, { FULFILMENT_STATUSES } from '../models/Order.js'
import type { FulfilmentStatus } from '../models/Order.js'
import { searchFilter } from '../utils/search.js'
import type { AdminIdentity } from './adminAuth.js'
import { currencyInfo } from './currency.js'
import { createNote, listNotes } from './staffNotes.js'

export const ORDER_PAGE_SIZE = 25
const HISTORY_LIMIT = 50
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

async function history(reference: string) {
  const records = await AuditRecord.find({ targetType: 'order', targetId: reference }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_LIMIT).lean()
  return records.map((record) => ({ action: record.action, actor: { name: record.actor?.name ?? '', email: record.actor?.email ?? '' }, changes: record.changes, createdAt: record.createdAt }))
}

export async function getOrder(reference: string) {
  const order: StoredOrder | null = await Order.findOne({ reference }).lean()
  if (!order) throw new NotFoundError('Order not found.')
  const [statusHistory, notes] = await Promise.all([history(reference), listNotes('order', reference)])
  return { order: toDetail(order), history: statusHistory, notes }
}

// Newest first, optionally one stage only and matching a search, with a count per stage (of the
// matching orders) for the filter buttons.
export async function listOrders(page: number, stage: OrderStage | null, search: string) {
  const matching = searchFilter(search, SEARCH_FIELDS)
  const filter = stage ? { ...matching, ...stageFilter(stage) } : matching
  const [total, orders, grouped] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * ORDER_PAGE_SIZE).limit(ORDER_PAGE_SIZE).lean<StoredOrder[]>(),
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
    page,
    totalPages: Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)),
    total,
    counts,
  }
}

// Staff move a paid order along; payment status is never theirs to change. The change and its
// audit record are saved together. Setting the status it already has changes nothing.
export async function setFulfilmentStatus(admin: AdminIdentity, reference: string, status: FulfilmentStatus) {
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
    await Order.updateOne({ reference }, { $set: { fulfilmentStatus: status } }, { session, runValidators: true })
    await AuditRecord.create([{
      action: 'order.status',
      targetType: 'order',
      targetId: reference,
      actor: { adminId: admin.id, email: admin.email, name: admin.name },
      changes: [{ field: 'fulfilmentStatus', from, to: status }],
    }], { session })
  })
  return getOrder(reference)
}

export async function addOrderNote(admin: AdminIdentity, reference: string, text: string) {
  if (!await Order.exists({ reference })) throw new NotFoundError('Order not found.')
  await createNote(admin, 'order', reference, text)
  return getOrder(reference)
}
