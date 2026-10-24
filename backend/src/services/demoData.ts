import AdminUser from '../models/AdminUser.js'
import AuditRecord from '../models/AuditRecord.js'
import BankTransferSettings, { BANK_TRANSFER_SETTINGS_ID } from '../models/BankTransferSettings.js'
import ContactRequest from '../models/ContactRequest.js'
import DeliveryArea from '../models/DeliveryArea.js'
import Order from '../models/Order.js'
import RequestNote from '../models/RequestNote.js'
import { demoContactRequests, demoDeliveryAreas, demoOrders, demoPrices } from '../data/demoData.js'
import Product from '../models/Product.js'
import sharp from 'sharp'
import { SAMPLE_BANK_DETAILS, isSampleAccount } from './bankTransfer.js'
import type { ImageStore } from './imageStore.js'
import { prepareRequestFiles, storeRequestFiles } from './requestFiles.js'
import type { DemoContactRequest, DemoStatusStep } from '../data/demoData.js'

export const PRODUCTION_DATABASE = 'gpec'

// Demo data reaches the live database only as a deliberate choice (--production), never through a
// wrong .env. The owner chose to show it on the live site before launch (2026-10-23); it must be
// removed before launch (CLAUDE.md Known Gaps).
export function assertDemoAllowed(databaseName: string, nodeEnv: string, productionConfirmed: boolean) {
  const isProduction = databaseName === PRODUCTION_DATABASE || nodeEnv === 'production'
  if (isProduction && !productionConfirmed) {
    throw new Error(`Refusing demo data: the database is "${databaseName}" and NODE_ENV is "${nodeEnv}". Add --production to change the live database on purpose.`)
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
const AREA_NAMES = demoDeliveryAreas.map((area) => area.name)
const DEMO_BANK = { ...SAMPLE_BANK_DETAILS, instructions: '', payWithinDays: 3 }
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

// A plainly invented "photo": a grey plate with dark lines where a nameplate's text would be. No
// lettering, because the server image may have no fonts; the file name says it is a sample.
function samplePhoto(seed: number) {
  const rows = Array.from({ length: 6 }, (_, i) => `<rect x="120" y="${170 + i * 70}" width="${560 - ((i * 97 + seed * 53) % 260)}" height="22" rx="4" fill="#2b3440"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#5c6670"/><rect x="80" y="90" width="640" height="460" rx="18" fill="#c9ced3" stroke="#3a434d" stroke-width="8"/><rect x="120" y="120" width="${200 + seed * 40}" height="30" rx="4" fill="#ff7600"/>${rows}</svg>`
  return sharp(Buffer.from(svg)).jpeg().toBuffer()
}

// A one-page PDF that says what it is, in a font every PDF reader has built in (Helvetica), with
// the byte offsets PDF readers need to find each part.
function samplePdf(title: string) {
  const lines = [title, 'Demo data for trying the GPEC admin panel.', 'Not a real drawing.']
  const text = lines.map((line) => `(${line.replace(/[\\()]/g, '\\$&')}) '`).join('\n')
  const content = `BT\n/F1 16 Tf\n22 TL\n72 780 Td\n${text}\nET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(pdf, 'latin1')
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

// A demo request's sample files, checked and stored exactly as a customer's would be.
async function demoAttachments(store: ImageStore | null, request: DemoContactRequest) {
  if (!store || !request.files) return []
  const received = await Promise.all(request.files.map(async (file, index) => ({
    originalname: file.name,
    buffer: file.kind === 'photo' ? await samplePhoto(index) : samplePdf(file.name.replace(/\.pdf$/, '')),
  })))
  const prepared = await prepareRequestFiles(received)
  await storeRequestFiles(store, prepared)
  return prepared.map(({ id, name, contentType, size }) => ({ id, name, contentType, size }))
}

// Demo delivery areas that are missing (by name), and bank transfer switched on with the sample
// details, unless staff have entered real ones. Areas already there, even edited, are left alone.
async function seedShopSettings() {
  const existing = new Set((await DeliveryArea.find({ name: { $in: AREA_NAMES } }).select('name').lean()).map((area) => area.name))
  const missing = demoDeliveryAreas.map((area, index) => ({ ...area, fee: kobo(area.fee), sortOrder: (index + 1) * 10 })).filter((area) => !existing.has(area.name))
  if (missing.length > 0) await DeliveryArea.insertMany(missing)
  const bank = await BankTransferSettings.findById(BANK_TRANSFER_SETTINGS_ID).lean()
  const bankSwitchedOn = !bank || isSampleAccount(bank)
  if (bankSwitchedOn) await BankTransferSettings.updateOne({ _id: BANK_TRANSFER_SETTINGS_ID }, { $set: { ...(bank ? {} : DEMO_BANK), enabled: true } }, { upsert: true })
  let pricesSet = 0
  for (const [id, naira] of Object.entries(demoPrices)) {
    const update = await Product.updateOne({ _id: id, isPlaceholder: true, price: null }, { $set: { price: kobo(naira) } })
    pricesSet += update.modifiedCount
  }
  return { deliveryAreas: missing.length, bankTransferOn: bankSwitchedOn, pricesSet }
}

// Adds the demo orders and contact requests that are not there yet; existing ones are left alone, so
// running it twice changes nothing. Status history and notes need an author, so they are added (by
// the first active admin) only when an admin account exists. Sample attached files need file storage
// (store); without it the demo requests have none.
export async function seedDemoData(now = Date.now(), store: ImageStore | null = null) {
  const shop = await seedShopSettings()
  const areaIds = new Map((await DeliveryArea.find({ name: { $in: AREA_NAMES } }).select('name').lean()).map((area) => [area.name, String(area._id)]))
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
    const isTransfer = order.paymentMethod === 'bank_transfer'
    const paystackFee = isTransfer ? 0 : demoPaystackFee(subtotal + deliveryFee)
    const areaId = order.deliveryAreaName ? areaIds.get(order.deliveryAreaName) : undefined
    const lastStep = order.steps.at(-1)
    return {
      reference: order.reference,
      customer: order.customer,
      items,
      fulfilmentMethod: order.fulfilmentMethod,
      deliveryAddress: order.deliveryAddress,
      deliveryArea: areaId && order.deliveryAreaName ? { areaId, name: order.deliveryAreaName } : null,
      paymentMethod: order.paymentMethod ?? 'paystack',
      bankTransfer: isTransfer ? { ...DEMO_BANK, isSample: true } : null,
      transferReportedAt: order.transferReported === undefined ? null : new Date(placedAt + order.transferReported),
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
  const attachments = await Promise.all(newContacts.map((request) => demoAttachments(store, request)))
  await ContactRequest.insertMany(newContacts.map((request, index) => {
    const placedAt = now - request.age
    const lastStep = request.steps.at(-1)
    return {
      attachments: attachments[index],
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
  return { orders: newOrders.length, contactRequests: newContacts.length, files: attachments.flat().length, withHistory: admin !== null, ...shop }
}

// Removes every demo record, with its status history and notes, and nothing else: they are found by
// their exact demo references, and demo delivery areas by name. Bank transfer goes back to off with
// the sample details, unless staff have entered real ones (those are kept).
export async function removeDemoData() {
  const targets = [...ORDER_REFERENCES, ...CONTACT_REFERENCES]
  const areas = await DeliveryArea.find({ name: { $in: AREA_NAMES } }).select('_id').lean()
  const areaIds = areas.map((area) => String(area._id))
  const bank = await BankTransferSettings.findById(BANK_TRANSFER_SETTINGS_ID).lean()
  const [orders, contactRequests, deliveryAreas] = await Promise.all([
    Order.deleteMany({ reference: { $in: ORDER_REFERENCES } }),
    ContactRequest.deleteMany({ reference: { $in: CONTACT_REFERENCES } }),
    DeliveryArea.deleteMany({ _id: { $in: areas.map((area) => area._id) } }),
    AuditRecord.deleteMany({ targetType: { $in: ['order', 'contactRequest'] }, targetId: { $in: targets } }),
    AuditRecord.deleteMany({ targetType: 'deliveryArea', targetId: { $in: areaIds } }),
    RequestNote.deleteMany({ targetType: { $in: ['order', 'contactRequest'] }, targetId: { $in: targets } }),
    ...(bank && isSampleAccount(bank) ? [BankTransferSettings.deleteOne({ _id: BANK_TRANSFER_SETTINGS_ID })] : []),
    ...Object.entries(demoPrices).map(([id, naira]) => Product.updateOne({ _id: id, isPlaceholder: true, price: kobo(naira) }, { $set: { price: null } })),
  ])
  return { orders: orders.deletedCount, contactRequests: contactRequests.deletedCount, deliveryAreas: deliveryAreas.deletedCount }
}
