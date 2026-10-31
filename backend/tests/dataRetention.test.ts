import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { SITE_CONTENT_DEFAULTS } from '../src/data/siteContentDefaults.js'
import AuditRecord from '../src/models/AuditRecord.js'
import ContactRequest from '../src/models/ContactRequest.js'
import Order from '../src/models/Order.js'
import PendingFileDeletion from '../src/models/PendingFileDeletion.js'
import RequestNote from '../src/models/RequestNote.js'
import SecurityEvent from '../src/models/SecurityEvent.js'
import { deleteContactRequest, deleteOrder, dueContactRequests, dueUnpaidOrders, paidOrderCutoff, previewCleanup, retentionCutoffs, runCleanup } from '../src/services/dataRetention.js'
import { MemoryImageStore, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()

const NOW = new Date('2033-03-15T12:00:00Z')
const cutoffs = retentionCutoffs(NOW, '12-31')
const LONG_AGO = new Date('2032-09-14T12:00:00Z')
const RECENTLY = new Date('2032-09-16T12:00:00Z')
const actor = { adminId: '64b000000000000000000001', email: 'staff@example.test', name: 'Staff' }
let counter = 0

// updatedAt is written directly, as Mongoose would otherwise set it to now.
async function contactRequest(fields: { status?: string, keepRecord?: boolean, updatedAt?: Date, fileId?: string } = {}) {
  const reference = `GPEC-C-2026-${String(++counter).padStart(8, '0')}`
  await ContactRequest.create({
    reference, fullName: 'Ada Buyer', email: 'ada@example.com', message: 'A message.', status: fields.status ?? 'closed', keepRecord: fields.keepRecord ?? false,
    attachments: fields.fileId ? [{ id: fields.fileId, name: 'nameplate.webp', contentType: 'image/webp', size: 10 }] : [],
  })
  await ContactRequest.collection.updateOne({ reference }, { $set: { updatedAt: fields.updatedAt ?? LONG_AGO } })
  return reference
}

async function order(fields: { paymentStatus?: string, fulfilmentStatus?: string, paidAt?: Date | null, updatedAt?: Date } = {}) {
  const reference = `GPEC-O-2026-${String(++counter).padStart(8, '0')}`
  await Order.create({
    reference, customer: { fullName: 'Ada Buyer', email: 'ada@example.com', phone: '0800 000 0000' },
    items: [{ productId: 'panel-001', name: 'Panel', reference: 'GPEC-CP-001', unitPrice: 100, quantity: 1, lineTotal: 100 }],
    fulfilmentMethod: 'pickup', currency: 'NGN', subtotal: 100, deliveryFee: 0, paystackFee: 0, total: 100,
    paymentStatus: fields.paymentStatus ?? 'pending_payment', fulfilmentStatus: fields.fulfilmentStatus ?? 'new', paidAt: fields.paidAt ?? null,
  })
  await Order.collection.updateOne({ reference }, { $set: { updatedAt: fields.updatedAt ?? LONG_AGO } })
  return reference
}

const exists = async (model: typeof ContactRequest | typeof Order, reference: string) => (await model.exists({ reference })) !== null

describe('the dates', () => {
  it('counts six years from the end of the accounting year, in Nigeria', () => {
    // The first moment of 2033 in Nigeria is 23:00 UTC on 31 December 2032.
    expect(paidOrderCutoff(new Date('2032-12-31T22:59:59Z'), '12-31')).toEqual(new Date('2025-12-31T23:00:00Z'))
    expect(paidOrderCutoff(new Date('2032-12-31T23:00:00Z'), '12-31')).toEqual(new Date('2026-12-31T23:00:00Z'))
  })

  it('works for a year ending mid-year', () => {
    expect(paidOrderCutoff(new Date('2033-06-30T22:59:59Z'), '06-30')).toEqual(new Date('2026-06-30T23:00:00Z'))
    expect(paidOrderCutoff(new Date('2033-06-30T23:00:00Z'), '06-30')).toEqual(new Date('2027-06-30T23:00:00Z'))
  })

  it('goes back six calendar months, to the month’s last day if shorter', () => {
    expect(retentionCutoffs(new Date('2033-08-31T10:00:00Z'), null).contactRequests).toEqual(new Date('2033-02-28T10:00:00Z'))
  })

  it('knows no paid-order date without the accounting year end', () => {
    expect(retentionCutoffs(NOW, null).paidOrders).toBeNull()
  })
})

describe('the settings', () => {
  it('is off by default', () => {
    expect(loadConfig({})).toMatchObject({ retentionCleanup: false, accountingYearEnd: null })
  })

  it('cannot be switched on without the accounting year end', () => {
    expect(() => loadConfig({ RETENTION_CLEANUP: 'on' })).toThrow(/RETENTION_ACCOUNTING_YEAR_END/)
    expect(loadConfig({ RETENTION_CLEANUP: 'on', RETENTION_ACCOUNTING_YEAR_END: '12-31' }).retentionCleanup).toBe(true)
  })

  it.each(['31-12', '02-29', '13-01', '12/31', '04-31'])('refuses %s as an accounting year end', (value) => {
    expect(() => loadConfig({ RETENTION_ACCOUNTING_YEAR_END: value })).toThrow(/RETENTION_ACCOUNTING_YEAR_END/)
  })
})

describe('contact requests', () => {
  it('deletes a request closed over 6 months ago, with its notes, history, and files', async () => {
    const store = new MemoryImageStore()
    const fileId = 'a'.repeat(32)
    await store.put(`request-files/${fileId}`, Buffer.from('x'), 'image/webp')
    await store.put('product-images/photo.webp', Buffer.from('x'), 'image/webp')
    await store.put(`request-files/${'b'.repeat(32)}`, Buffer.from('x'), 'image/webp')
    const reference = await contactRequest({ fileId })
    const other = await contactRequest({ status: 'new', fileId: 'b'.repeat(32) })
    for (const targetId of [reference, other]) {
      await RequestNote.create({ targetType: 'contactRequest', targetId, text: 'Phoned Ada.', author: actor })
      await AuditRecord.create({ action: 'contactRequest.status', targetType: 'contactRequest', targetId, actor, changes: [{ field: 'status', from: 'new', to: 'closed' }] })
    }

    const counts = await runCleanup(cutoffs, store)

    expect(counts).toEqual({ contactRequests: 1, unpaidOrders: 0, paidOrders: 0, files: 1 })
    expect(await exists(ContactRequest, reference)).toBe(false)
    expect(await RequestNote.countDocuments({ targetId: reference })).toBe(0)
    expect(await AuditRecord.countDocuments({ targetId: reference })).toBe(0)
    expect(store.objects.has(`request-files/${fileId}`)).toBe(false)
    expect(await PendingFileDeletion.countDocuments()).toBe(0)
    // Nothing else goes.
    expect(await exists(ContactRequest, other)).toBe(true)
    expect(await RequestNote.countDocuments({ targetId: other })).toBe(1)
    expect(await AuditRecord.countDocuments({ targetId: other })).toBe(1)
    expect(store.objects.has(`request-files/${'b'.repeat(32)}`)).toBe(true)
    expect(store.objects.has('product-images/photo.webp')).toBe(true)
  })

  it('leaves a request never closed, closed recently, or marked to keep', async () => {
    const left = [
      await contactRequest({ status: 'new' }),
      await contactRequest({ status: 'in_progress' }),
      await contactRequest({ updatedAt: RECENTLY }),
      await contactRequest({ keepRecord: true }),
    ]
    expect((await runCleanup(cutoffs, null)).contactRequests).toBe(0)
    for (const reference of left) expect(await exists(ContactRequest, reference)).toBe(true)
  })

  it('deletes a closed request stored before the switch existed', async () => {
    const reference = await contactRequest()
    await ContactRequest.collection.updateOne({ reference }, { $unset: { keepRecord: '' } })
    expect((await runCleanup(cutoffs, null)).contactRequests).toBe(1)
  })

  it('leaves a request kept or reopened just after the list was read', async () => {
    const kept = await contactRequest()
    await ContactRequest.collection.updateOne({ reference: kept }, { $set: { keepRecord: true } })
    expect(await deleteContactRequest(kept, dueContactRequests(cutoffs))).toBe(false)
    const reopened = await contactRequest()
    await ContactRequest.collection.updateOne({ reference: reopened }, { $set: { status: 'in_progress' } })
    expect(await deleteContactRequest(reopened, dueContactRequests(cutoffs))).toBe(false)
    expect(await exists(ContactRequest, kept)).toBe(true)
    expect(await exists(ContactRequest, reopened)).toBe(true)
  })

  it('removes a file on a later run when storage fails, and never loses track of it', async () => {
    const fileId = 'c'.repeat(32)
    const store = new MemoryImageStore()
    await store.put(`request-files/${fileId}`, Buffer.from('x'), 'image/webp')
    const reference = await contactRequest({ fileId })
    const remove = store.remove.bind(store)
    store.remove = async () => { throw new Error('AccessDenied') }

    expect(await runCleanup(cutoffs, store)).toMatchObject({ contactRequests: 1, files: 0 })
    expect(await exists(ContactRequest, reference)).toBe(false)
    expect(await PendingFileDeletion.countDocuments({ key: `request-files/${fileId}` })).toBe(1)

    store.remove = remove
    expect((await runCleanup(cutoffs, store)).files).toBe(1)
    expect(store.objects.has(`request-files/${fileId}`)).toBe(false)
    expect(await PendingFileDeletion.countDocuments()).toBe(0)
  })

  it('keeps the file on its list while storage is not set up', async () => {
    await contactRequest({ fileId: 'd'.repeat(32) })
    await runCleanup(cutoffs, null)
    expect(await PendingFileDeletion.countDocuments()).toBe(1)
  })
})

describe('orders', () => {
  it('deletes an unpaid order unchanged for over 6 months, with its notes and history', async () => {
    const abandoned = await order()
    const closed = await order({ paymentStatus: 'failed' })
    const recent = await order({ updatedAt: RECENTLY })
    await RequestNote.create({ targetType: 'order', targetId: abandoned, text: 'No answer.', author: actor })
    await AuditRecord.create({ action: 'order.close', targetType: 'order', targetId: closed, actor })

    expect((await runCleanup(cutoffs, null)).unpaidOrders).toBe(2)

    expect(await exists(Order, abandoned)).toBe(false)
    expect(await exists(Order, closed)).toBe(false)
    expect(await exists(Order, recent)).toBe(true)
    expect(await RequestNote.countDocuments({ targetId: abandoned })).toBe(0)
    expect(await AuditRecord.countDocuments({ targetId: closed })).toBe(0)
  })

  it('never treats a paid order as unpaid, however old', async () => {
    const paid = await order({ paymentStatus: 'paid', fulfilmentStatus: 'completed', paidAt: new Date('2032-01-01T00:00:00Z') })
    expect((await runCleanup(cutoffs, null)).unpaidOrders).toBe(0)
    expect(await exists(Order, paid)).toBe(true)
  })

  it('leaves an order paid just after the list was read', async () => {
    const reference = await order()
    await Order.collection.updateOne({ reference }, { $set: { paymentStatus: 'paid' } })
    expect(await deleteOrder(reference, dueUnpaidOrders(cutoffs))).toBe(false)
    expect(await exists(Order, reference)).toBe(true)
  })

  it('deletes a finished paid order six accounting years on, keeping the product’s stock history', async () => {
    // The cutoff on 15 March 2033 is the end of 2026.
    const due = await order({ paymentStatus: 'paid', fulfilmentStatus: 'completed', paidAt: new Date('2026-12-31T22:00:00Z') })
    const cancelled = await order({ paymentStatus: 'paid', fulfilmentStatus: 'cancelled', paidAt: new Date('2026-01-10T00:00:00Z') })
    const nextYear = await order({ paymentStatus: 'paid', fulfilmentStatus: 'completed', paidAt: new Date('2026-12-31T23:30:00Z') })
    const unfinished = await order({ paymentStatus: 'paid', fulfilmentStatus: 'processing', paidAt: new Date('2026-01-10T00:00:00Z') })
    const noDate = await order({ paymentStatus: 'paid', fulfilmentStatus: 'completed' })
    await AuditRecord.create({ action: 'order.status', targetType: 'order', targetId: due, actor })
    await AuditRecord.create({ action: 'product.sale', targetType: 'product', targetId: 'panel-001', orderReference: due, changes: [{ field: 'stockQuantity', from: 5, to: 4 }] })

    expect((await runCleanup(cutoffs, null)).paidOrders).toBe(2)

    expect(await exists(Order, due)).toBe(false)
    expect(await exists(Order, cancelled)).toBe(false)
    for (const reference of [nextYear, unfinished, noDate]) expect(await exists(Order, reference)).toBe(true)
    expect(await AuditRecord.countDocuments({ targetType: 'order', targetId: due })).toBe(0)
    expect(await AuditRecord.countDocuments({ action: 'product.sale', orderReference: due })).toBe(1)
  })

  it('deletes no paid order without the accounting year end', async () => {
    const paid = await order({ paymentStatus: 'paid', fulfilmentStatus: 'completed', paidAt: new Date('2020-01-01T00:00:00Z') })
    expect((await runCleanup(retentionCutoffs(NOW, null), null)).paidOrders).toBe(0)
    expect(await exists(Order, paid)).toBe(true)
  })
})

describe('the record of a run', () => {
  it('writes counts to the security log, with no customer details or references', async () => {
    const reference = await contactRequest()
    await runCleanup(cutoffs, null)
    const entry = await SecurityEvent.findOne({ action: 'retention.cleanup' }).lean()
    expect(entry?.detail).toBe('1 contact requests, 0 unpaid orders, 0 paid orders, 0 files')
    expect(entry?.via).toBe('automatic')
    expect(JSON.stringify(entry)).not.toContain(reference)
    expect(JSON.stringify(entry)).not.toContain('ada@example.com')
  })

  it('writes nothing when nothing was due', async () => {
    await runCleanup(cutoffs, null)
    expect(await SecurityEvent.countDocuments()).toBe(0)
  })

  it('previews without deleting', async () => {
    const closed = await contactRequest()
    await contactRequest({ keepRecord: true })
    const abandoned = await order()
    expect(await previewCleanup(cutoffs)).toEqual({ contactRequests: 1, unpaidOrders: 1, paidOrders: 0, kept: 1, filesWaiting: 0 })
    expect(await exists(ContactRequest, closed)).toBe(true)
    expect(await exists(Order, abandoned)).toBe(true)
  })
})

describe('the "Keep this request" switch', () => {
  const app = testApp()
  const ORIGIN = 'http://localhost:5173'
  const path = (reference: string) => `/api/admin/contact-requests/${reference}/keep`

  it('is refused for an anonymous visitor', async () => {
    const reference = await contactRequest()
    const res = await request(app).patch(path(reference)).set('Origin', ORIGIN).send({ keep: true })
    expect(res.status).toBe(401)
    expect((await ContactRequest.findOne({ reference }))?.keepRecord).toBe(false)
  })

  it('saves the choice, records who made it, and protects the request', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    const reference = await contactRequest()
    const res = await agent.patch(path(reference)).set('Origin', ORIGIN).send({ keep: true })
    expect(res.status).toBe(200)
    expect(res.body.item.keepRecord).toBe(true)
    expect(res.body.history[0].changes).toEqual([{ field: 'keepRecord', from: false, to: true }])
    await ContactRequest.collection.updateOne({ reference }, { $set: { updatedAt: LONG_AGO } })
    expect((await runCleanup(cutoffs, null)).contactRequests).toBe(0)
  })

  it('records nothing and does not restart the 6 months when nothing changes', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    const reference = await contactRequest()
    expect((await agent.patch(path(reference)).set('Origin', ORIGIN).send({ keep: false })).status).toBe(200)
    expect(await AuditRecord.countDocuments({ targetId: reference })).toBe(0)
    expect((await ContactRequest.findOne({ reference }))?.updatedAt).toEqual(LONG_AGO)
  })

  it('reads a request stored before the switch existed as not kept', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    const reference = await contactRequest()
    await ContactRequest.collection.updateOne({ reference }, { $unset: { keepRecord: '' } })
    expect((await agent.get(`/api/admin/contact-requests/${reference}`)).body.item.keepRecord).toBe(false)
  })

  it.each([[{}], [{ keep: 'yes' }], [{ keep: { $ne: null } }], [{ keep: true, status: 'closed' }]])('refuses %j', async (body) => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    const reference = await contactRequest()
    expect((await agent.patch(path(reference)).set('Origin', ORIGIN).send(body)).status).toBe(400)
    expect((await ContactRequest.findOne({ reference }))?.keepRecord).toBe(false)
  })
})

describe('the privacy notice’s starting text', () => {
  it('states the periods the clean-up uses', () => {
    const body = SITE_CONTENT_DEFAULTS.privacy.sections.find((section) => section.heading === 'How long we keep it')?.body ?? ''
    expect(body).toContain('6 years from the end of our accounting year')
    expect(body).toContain('Orders that were not paid: 6 months')
    expect(body).toContain('6 months after we close the enquiry')
    expect(body).toContain('12 months')
    expect(body).not.toContain('[')
  })
})
