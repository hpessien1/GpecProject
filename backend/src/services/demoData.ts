import AdminUser from '../models/AdminUser.js'
import AuditRecord from '../models/AuditRecord.js'
import ContactRequest from '../models/ContactRequest.js'
import Order from '../models/Order.js'
import RequestNote from '../models/RequestNote.js'
import { demoContactRequests, demoOrders } from '../data/demoData.js'
import type { DemoStatusStep } from '../data/demoData.js'

export const PRODUCTION_DATABASE = 'gpec'

// Demo data must never reach the live database, whatever the command line says.
export function assertDemoAllowed(databaseName: string, nodeEnv: string) {
  if (databaseName === PRODUCTION_DATABASE || nodeEnv === 'production') {
    throw new Error(`Refusing demo data: the database is "${databaseName}" and NODE_ENV is "${nodeEnv}". Demo data is for development (gpec_dev) only.`)
  }
}

const KOBO_PER_NAIRA = 100
const kobo = (naira: number) => naira * KOBO_PER_NAIRA

// An illustrative Paystack fee (1.5% plus ₦100, capped at ₦2,000) so the demo totals look complete.
// Real fees will come from GPEC's Paystack plan as configuration (CLAUDE.md Section 4.1).
function demoPaystackFee(amount: number) {
  return Math.min(Math.round(amount * 0.015) + kobo(100), kobo(2000))
}

const ORDER_REFERENCES = demoOrders.map((order) => order.reference)
const CONTACT_REFERENCES = demoContactRequests.map((request) => request.reference)

// Status history entries, from "new" through each step, by the given admin.
function historyRecords(admin: { _id: unknown, email: string, name: string }, targetType: 'order' | 'contactRequest', targetId: string, placedAt: number, steps: DemoStatusStep[]) {
  const field = targetType === 'order' ? 'fulfilmentStatus' : 'status'
  return steps.map((step, index) => ({
    action: `${targetType}.status`,
    targetType,
    targetId,
    actor: { adminId: admin._id, email: admin.email, name: admin.name },
    changes: [{ field, from: index === 0 ? 'new' : steps[index - 1].to, to: step.to }],
    createdAt: new Date(placedAt + step.after),
  }))
}

// Adds the demo orders and contact requests that are not there yet; existing ones are left alone, so
// running it twice changes nothing. Status history and notes need an author, so they are added (by
// the first active admin) only when an admin account exists.
export async function seedDemoData(now = Date.now()) {
  const [existingOrders, existingContacts, admin] = await Promise.all([
    Order.find({ reference: { $in: ORDER_REFERENCES } }).select('reference').lean(),
    ContactRequest.find({ reference: { $in: CONTACT_REFERENCES } }).select('reference').lean(),
    AdminUser.findOne({ isActive: true }).sort({ createdAt: 1 }).lean(),
  ])
  const haveOrder = new Set(existingOrders.map((order) => order.reference))
  const haveContact = new Set(existingContacts.map((request) => request.reference))
  const newOrders = demoOrders.filter((order) => !haveOrder.has(order.reference))
  const newContacts = demoContactRequests.filter((request) => !haveContact.has(request.reference))

  await Order.insertMany(newOrders.map((order) => {
    const placedAt = now - order.age
    const items = order.items.map((item) => ({ ...item, unitPrice: kobo(item.unitPrice), lineTotal: kobo(item.unitPrice) * item.quantity }))
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
    const deliveryFee = kobo(order.deliveryFee)
    const paystackFee = demoPaystackFee(subtotal + deliveryFee)
    const lastStep = order.steps.at(-1)
    return {
      reference: order.reference,
      customer: order.customer,
      items,
      fulfilmentMethod: order.fulfilmentMethod,
      deliveryAddress: order.deliveryAddress,
      currency: 'NGN',
      subtotal,
      deliveryFee,
      paystackFee,
      total: subtotal + deliveryFee + paystackFee,
      paymentStatus: order.paymentStatus,
      paidAt: order.paymentStatus === 'paid' ? new Date(placedAt + 60 * 1000) : null,
      fulfilmentStatus: lastStep?.to ?? 'new',
      createdAt: new Date(placedAt),
      updatedAt: new Date(placedAt + (lastStep?.after ?? 0)),
    }
  }))
  await ContactRequest.insertMany(newContacts.map((request) => {
    const placedAt = now - request.age
    const lastStep = request.steps.at(-1)
    return {
      reference: request.reference,
      fullName: request.fullName,
      company: request.company,
      email: request.email,
      phone: request.phone,
      subject: request.subject,
      message: request.message,
      status: lastStep?.to ?? 'new',
      createdAt: new Date(placedAt),
      updatedAt: new Date(placedAt + (lastStep?.after ?? 0)),
    }
  }))

  if (admin) {
    const author = { adminId: admin._id, email: admin.email, name: admin.name }
    await AuditRecord.insertMany([
      ...newOrders.flatMap((order) => historyRecords(admin, 'order', order.reference, now - order.age, order.steps)),
      ...newContacts.flatMap((request) => historyRecords(admin, 'contactRequest', request.reference, now - request.age, request.steps)),
    ])
    await RequestNote.insertMany([
      ...newOrders.filter((order) => order.note).map((order) => ({ targetType: 'order', targetId: order.reference, text: order.note?.text, author, createdAt: new Date(now - order.age + (order.note?.after ?? 0)) })),
      ...newContacts.filter((request) => request.note).map((request) => ({ targetType: 'contactRequest', targetId: request.reference, text: request.note?.text, author, createdAt: new Date(now - request.age + (request.note?.after ?? 0)) })),
    ])
  }
  return { orders: newOrders.length, contactRequests: newContacts.length, withHistory: admin !== null }
}

// Removes every demo record, with its status history and notes, and nothing else: they are found by
// their exact demo references.
export async function removeDemoData() {
  const targets = [...ORDER_REFERENCES, ...CONTACT_REFERENCES]
  const [orders, contactRequests] = await Promise.all([
    Order.deleteMany({ reference: { $in: ORDER_REFERENCES } }),
    ContactRequest.deleteMany({ reference: { $in: CONTACT_REFERENCES } }),
    AuditRecord.deleteMany({ targetType: { $in: ['order', 'contactRequest'] }, targetId: { $in: targets } }),
    RequestNote.deleteMany({ targetType: { $in: ['order', 'contactRequest'] }, targetId: { $in: targets } }),
  ])
  return { orders: orders.deletedCount, contactRequests: contactRequests.deletedCount }
}
