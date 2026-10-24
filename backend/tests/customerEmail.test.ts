import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import CustomerEmailSettings from '../src/models/CustomerEmailSettings.js'
import { createNotifier } from '../src/services/notifications.js'
import type { OrderEmailData } from '../src/services/emailTemplates.js'
import { RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, createTestAdmin, loggedInAgent, noBreaches, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const ORIGIN = 'http://localhost:5173'
const SETTINGS = '/api/admin/customer-email'
const PUBLISHED = 'gpecengineeringcompanylimited@gmail.com'

let mailer: RecordingMailer
let app: ReturnType<typeof testApp>
let agent: Awaited<ReturnType<typeof loggedInAgent>>
beforeEach(async () => {
  mailer = new RecordingMailer()
  app = testApp({ email: TEST_EMAIL_SETTINGS }, mailer, noBreaches)
  await createTestAdmin()
  await createTestAdmin({ email: 'second@example.test', name: 'Second Admin' })
  await createTestAdmin({ email: 'former@example.test', name: 'Former Admin', isActive: false })
  agent = await loggedInAgent(app)
})

const change = (body: unknown, origin = ORIGIN) => agent.patch(SETTINGS).set('Origin', origin).send(body as object)

describe('the reply-to address for customer emails (admin)', () => {
  it('is for logged-in admins only', async () => {
    expect((await request(app).get(SETTINGS)).status).toBe(401)
    expect((await request(app).patch(SETTINGS).send({ replyTo: 'x@example.com' })).status).toBe(401)
    expect((await change({ replyTo: 'x@example.com' }, 'https://evil.example')).status).toBe(403)
    expect(await CustomerEmailSettings.countDocuments()).toBe(0)
  })

  it('starts as GPEC’s published address, with no history', async () => {
    const res = await agent.get(SETTINGS)
    expect(res.body).toEqual({ settings: { replyTo: PUBLISHED }, emailOn: true, history: [], historyCursor: null })
  })

  it('saves a new address, records who changed it, and emails every active admin', async () => {
    const res = await change({ replyTo: '  Orders@GPECengineering.com ' })
    expect(res.status).toBe(200)
    expect(res.body.settings).toEqual({ replyTo: 'orders@gpecengineering.com' })
    expect(res.body.history).toEqual([expect.objectContaining({ action: 'customerEmail.update', actor: { name: TEST_ADMIN.name, email: TEST_ADMIN.email }, changes: [{ field: 'replyTo', from: PUBLISHED, to: 'orders@gpecengineering.com' }] })])
    expect((await agent.get(SETTINGS)).body.settings.replyTo).toBe('orders@gpecengineering.com')

    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    const [notice] = mailer.sent
    expect(notice.to.sort()).toEqual([TEST_ADMIN.email, 'second@example.test'])
    expect(notice.subject).toBe('GPEC customer email reply address was changed')
    expect(notice.text).toContain(`Before: ${PUBLISHED}\nNow: orders@gpecengineering.com`)
    expect(notice.text).toContain('https://www.example.com/#admin/emails')
  })

  it('records and emails nothing when the address is unchanged', async () => {
    await change({ replyTo: PUBLISHED })
    await change({ replyTo: 'orders@gpecengineering.com' })
    await change({ replyTo: 'ORDERS@gpecengineering.com' })
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    expect(await AuditRecord.countDocuments({ targetType: 'customerEmail' })).toBe(1)
  })

  it.each([
    [{}, 'replyTo', 'replyTo is required.'],
    [{ replyTo: '' }, 'replyTo', 'replyTo is required.'],
    [{ replyTo: 'not an address' }, 'replyTo', 'replyTo must be a valid email address.'],
    [{ replyTo: `${'a'.repeat(250)}@example.com` }, 'replyTo', 'replyTo must be 254 characters or fewer.'],
    [{ replyTo: { $gt: '' } }, 'replyTo', 'replyTo must be text.'],
    [{ replyTo: 'x@example.com', fromAddress: 'boss@example.com' }, 'fromAddress', 'fromAddress is not an editable field.'],
  ])('refuses %j, saving nothing', async (body, field, message) => {
    const res = await change(body)
    expect(res.status).toBe(400)
    expect(res.body.errors[field]).toBe(message)
    expect(await CustomerEmailSettings.countDocuments()).toBe(0)
    expect(await AuditRecord.countDocuments()).toBe(0)
  })
})

describe('customer emails carry the reply-to address', () => {
  const order: OrderEmailData & { _id: string } = {
    _id: '0123456789abcdef01234567', reference: 'GPEC-O-2026-0000000A', paidAt: new Date(), customer: { fullName: 'Ada Buyer', email: 'ada@example.org', phone: '+234 000 000 0000' },
    items: [{ name: 'Panel', reference: 'GPEC-CP-001', unitPrice: 100_000, quantity: 1, lineTotal: 100_000 }], fulfilmentMethod: 'pickup', currency: 'NGN', subtotal: 100_000, deliveryFee: 0, paystackFee: 0, total: 100_000,
    paymentMethod: 'bank_transfer', bankTransfer: { bankName: 'Sample Bank', accountName: 'GPEC', accountNumber: '0123456789', payWithinDays: 3 },
  }

  it('uses the address staff chose, for order, bank-transfer, and contact confirmations; staff emails reply to the customer', async () => {
    await change({ replyTo: 'orders@gpecengineering.com' })
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    mailer.sent.length = 0
    const notifier = createNotifier(mailer, TEST_EMAIL_SETTINGS)
    await notifier.orderPaid(order)
    await notifier.transferOrderPlaced(order)
    await request(app).post('/api/contact-requests').send({ fullName: 'Ada Buyer', email: 'ada@example.org', message: 'Hello' })
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(6))
    const toCustomer = mailer.sent.filter((message) => message.to.includes('ada@example.org'))
    const toStaff = mailer.sent.filter((message) => message.to.includes('staff1@example.com'))
    expect(toCustomer.map((message) => message.replyTo)).toEqual(['orders@gpecengineering.com', 'orders@gpecengineering.com', 'orders@gpecengineering.com'])
    expect(toStaff.map((message) => message.replyTo)).toEqual(['ada@example.org', 'ada@example.org', 'ada@example.org'])
    expect(toCustomer[0].text).toContain('reply to this email, or contact GPEC through')
  })

  it('falls back to GPEC’s published address if the saved one cannot be read, and still sends', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const notifier = createNotifier(mailer, TEST_EMAIL_SETTINGS, async () => { throw new Error('database down') })
    await notifier.orderPaid(order)
    expect(mailer.sent.find((message) => message.to.includes('ada@example.org'))?.replyTo).toBe(PUBLISHED)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('GPEC-O-2026-0000000A'))
    expect(JSON.stringify(error.mock.calls)).not.toContain('ada@example.org')
    error.mockRestore()
  })
})
