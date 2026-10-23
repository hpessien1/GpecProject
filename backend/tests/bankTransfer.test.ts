import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { beforeEach, describe, expect, it } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import BankTransferSettings from '../src/models/BankTransferSettings.js'
import Order from '../src/models/Order.js'
import Product from '../src/models/Product.js'
import { SAMPLE_BANK_DETAILS } from '../src/services/bankTransfer.js'
import { markOrderPaid } from '../src/services/checkout.js'
import { createNotifier } from '../src/services/notifications.js'
import { seedSampleProducts } from '../src/services/products.js'
import { FakePaystack, RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, TEST_PAYMENTS, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()

const ORIGIN = 'http://localhost:5173'
const SETTINGS = '/api/admin/bank-transfer'
const BANK = { bankName: 'Sample Bank', accountName: 'GPEC Engineering Company Limited', accountNumber: '0123456789', instructions: 'Send proof of payment by email.', payWithinDays: 3 }
const customer = { fullName: 'Ngozi Test', email: 'ngozi@example.com', phone: '+234 803 000 0000' }
const basket = { items: [{ productId: 'panel-001', quantity: 2 }], fulfilmentMethod: 'pickup' }

let mailer: RecordingMailer
let paystack: FakePaystack
let app: ReturnType<typeof testApp>
let agent: TestAgent

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

async function turnOnBankTransfer() {
  await BankTransferSettings.create({ ...BANK, enabled: true })
}

beforeEach(async () => {
  mailer = new RecordingMailer()
  paystack = new FakePaystack()
  // Paystack is not configured here: bank transfer works on its own.
  app = testApp({ email: TEST_EMAIL_SETTINGS }, mailer, undefined, null, null)
  await seedSampleProducts()
  await Product.updateOne({ _id: 'panel-001' }, { price: 150_000, stockQuantity: 5 })
  await createTestAdmin()
  await createTestAdmin({ email: 'second@example.test', name: 'Second Admin' })
  agent = await loggedInAgent(app)
})

function placeTransferOrder(body: object = {}) {
  return request(app).post('/api/checkout/orders').send({ ...customer, ...basket, paymentMethod: 'bank_transfer', ...body })
}

describe('bank details (admin)', () => {
  it('is for admins only', async () => {
    expect((await request(app).get(SETTINGS)).status).toBe(401)
    expect((await request(app).patch(SETTINGS).send({ enabled: true })).status).toBe(401)
  })

  it('starts off, with plainly fake sample details for staff to replace', async () => {
    const res = await agent.get(SETTINGS)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toEqual({ settings: { enabled: false, ...SAMPLE_BANK_DETAILS, instructions: '', payWithinDays: 3 }, isSample: true, history: [] })
  })

  it('saves the details, records who changed what, and emails every active admin', async () => {
    const res = await agent.patch(SETTINGS).set('Origin', ORIGIN).send({ ...BANK, enabled: true })
    expect(res.status).toBe(200)
    expect(res.body.settings).toEqual({ ...BANK, enabled: true })
    expect(res.body.isSample).toBe(false)
    expect(res.body.history[0]).toMatchObject({ actor: { name: TEST_ADMIN.name }, changes: expect.arrayContaining([{ field: 'accountNumber', from: '0000000000', to: '0123456789' }]) })
    await settle()
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0].to.sort()).toEqual([TEST_ADMIN.email, 'second@example.test'].sort())
    expect(mailer.sent[0].text).toContain('Account number: 0123456789')

    // Saving the same values again changes and records nothing.
    await agent.patch(SETTINGS).set('Origin', ORIGIN).send({ accountNumber: '0123456789' })
    expect(await AuditRecord.countDocuments({ targetType: 'bankTransfer' })).toBe(1)
  })

  it('refuses to switch it on before the bank, account name, and number are filled in', async () => {
    const res = await agent.patch(SETTINGS).set('Origin', ORIGIN).send({ enabled: true, accountNumber: '' })
    expect(res.status).toBe(400)
    expect(res.body.errors).toHaveProperty('enabled')
    expect(await BankTransferSettings.countDocuments()).toBe(0)
  })

  it.each([
    [{ accountNumber: '12345' }, 'accountNumber'],
    [{ accountNumber: '01234567ab' }, 'accountNumber'],
    [{ accountNumber: 123456789 }, 'accountNumber'],
    [{ payWithinDays: 0 }, 'payWithinDays'],
    [{ payWithinDays: 31 }, 'payWithinDays'],
    [{ enabled: 'yes' }, 'enabled'],
    [{ bankName: { $gt: '' } }, 'bankName'],
    [{ updatedAt: '2020-01-01' }, 'updatedAt'],
    [{}, 'body'],
  ])('refuses %j', async (body, field) => {
    const res = await agent.patch(SETTINGS).set('Origin', ORIGIN).send(body)
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.errors)).toContain(field)
  })

  it('refuses a change sent from another site', async () => {
    expect((await agent.patch(SETTINGS).set('Origin', 'https://evil.example').send(BANK)).status).toBe(403)
  })
})

describe('checking out by bank transfer', () => {
  it('is offered with GPEC’s details only while switched on, even without Paystack', async () => {
    expect((await request(app).get('/api/checkout')).body).toMatchObject({ paymentsAvailable: false, paymentMethods: [], bankTransfer: null })
    await turnOnBankTransfer()
    const res = await request(app).get('/api/checkout')
    expect(res.body).toMatchObject({ paymentsAvailable: true, paymentMethods: ['bank_transfer'], testMode: false, bankTransfer: { ...BANK, isSample: false } })
    await BankTransferSettings.updateOne({}, { enabled: false })
    expect((await request(app).post('/api/checkout/quote').send({ ...basket, paymentMethod: 'bank_transfer' })).body.code).toBe('BANK_TRANSFER_UNAVAILABLE')
  })

  it('offers both methods when Paystack is configured too, and refuses one that is off', async () => {
    const both = testApp({ payments: TEST_PAYMENTS }, null, undefined, null, paystack)
    await turnOnBankTransfer()
    expect((await request(both).get('/api/checkout')).body.paymentMethods).toEqual(['paystack', 'bank_transfer'])
    // Here (no Paystack), a Paystack order is refused rather than quietly turned into a transfer.
    const res = await request(app).post('/api/checkout/orders').send({ ...customer, ...basket, paymentMethod: 'paystack' })
    expect(res.status).toBe(503)
    expect(await Order.countDocuments()).toBe(0)
  })

  it('charges no Paystack fee for a transfer', async () => {
    await turnOnBankTransfer()
    const res = await request(app).post('/api/checkout/quote').send({ ...basket, paymentMethod: 'bank_transfer' })
    expect(res.body).toMatchObject({ subtotal: 300_000, paystackFee: 0, total: 300_000 })
  })

  it('refuses an unknown payment method', async () => {
    const res = await request(app).post('/api/checkout/quote').send({ ...basket, paymentMethod: 'cash' })
    expect(res.status).toBe(400)
    expect(res.body.errors).toHaveProperty('paymentMethod')
  })

  it('places an unpaid order with a copy of the details, starts no Paystack payment, and emails both sides', async () => {
    await turnOnBankTransfer()
    const res = await placeTransferOrder()
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ paymentMethod: 'bank_transfer', reference: expect.stringMatching(/^GPEC-O-/), paymentReference: expect.stringMatching(/^[0-9a-f]{24}$/) })
    const order = await Order.findById(res.body.paymentReference).lean()
    expect(order).toMatchObject({ paymentMethod: 'bank_transfer', paymentStatus: 'pending_payment', paystackFee: 0, total: 300_000, bankTransfer: BANK, transferReportedAt: null })
    await settle()
    const [staff, toCustomer] = mailer.sent
    expect(staff.to).toEqual(TEST_EMAIL_SETTINGS.staffRecipients)
    expect(staff.subject).toBe(`New order awaiting bank transfer ${res.body.reference}`)
    expect(toCustomer.to).toEqual([customer.email])
    expect(toCustomer.text).toContain('Account number: 0123456789')
    expect(toCustomer.text).toContain(`Description / narration: ${res.body.reference}`)
    expect(toCustomer.text).toContain(`/#shop/payment/${res.body.paymentReference}`)
    expect(toCustomer.text).not.toContain('Payment processing fee')

    // A later change to GPEC's details does not change what this order was told.
    await BankTransferSettings.updateOne({}, { accountNumber: '9999999999' })
    expect((await request(app).get(`/api/checkout/orders/${res.body.paymentReference}`)).body.bankTransfer.accountNumber).toBe('0123456789')
  })

  it('shows the order, the details, and the date to pay by, with no personal details', async () => {
    await turnOnBankTransfer()
    const { body } = await placeTransferOrder()
    const res = await request(app).get(`/api/checkout/orders/${body.paymentReference}`)
    expect(res.body).toMatchObject({ reference: body.reference, paymentMethod: 'bank_transfer', paymentStatus: 'pending_payment', total: 300_000, bankTransfer: { ...BANK, reportedAt: null } })
    const order = await Order.findById(body.paymentReference).lean()
    expect(Date.parse(res.body.bankTransfer.payBy) - (order?.createdAt.getTime() ?? 0)).toBe(3 * 24 * 60 * 60 * 1000)
    expect(JSON.stringify(res.body)).not.toMatch(/ngozi|803 000/i)
  })

  it('records "I have sent the transfer" once, tells staff once, and changes nothing else', async () => {
    await turnOnBankTransfer()
    const { body } = await placeTransferOrder()
    await settle()
    mailer.sent.length = 0
    const path = `/api/checkout/orders/${body.paymentReference}/transfer-sent`
    const first = await request(app).post(path).send()
    expect(first.body).toMatchObject({ paymentStatus: 'pending_payment', bankTransfer: { reportedAt: expect.any(String) } })
    await request(app).post(path).send()
    await settle()
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0].subject).toBe(`Customer reports a bank transfer for ${body.reference}`)
    expect((await request(app).post(path).send({ paymentStatus: 'paid' })).status).toBe(400)
    expect((await request(app).post('/api/checkout/orders/0123456789abcdef01234567/transfer-sent').send()).status).toBe(404)
  })

  it('a Paystack charge naming a transfer order does not pay it', async () => {
    await turnOnBankTransfer()
    const { body } = await placeTransferOrder()
    const outcome = await markOrderPaid({ reference: body.paymentReference, status: 'success', amount: 300_000, currency: 'NGN' }, createNotifier(null, null))
    expect(outcome).toBe('unknown_order')
    expect((await Order.findById(body.paymentReference).lean())?.paymentStatus).toBe('pending_payment')
  })
})

describe('staff confirming a transfer', () => {
  let reference: string

  beforeEach(async () => {
    await turnOnBankTransfer()
    reference = (await placeTransferOrder()).body.reference
    await settle()
    mailer.sent.length = 0
  })

  function act(path: 'transfer-received' | 'transfer-not-received', origin = ORIGIN) {
    return agent.post(`/api/admin/orders/${reference}/${path}`).set('Origin', origin).send()
  }

  it('lists the order as awaiting transfer, then as reported once the customer says so', async () => {
    expect((await agent.get('/api/admin/orders?stage=awaiting_transfer')).body.items.map((item: { reference: string }) => item.reference)).toEqual([reference])
    const order = await Order.findOne({ reference }).lean()
    await request(app).post(`/api/checkout/orders/${order?._id}/transfer-sent`).send()
    const list = await agent.get('/api/admin/orders')
    expect(list.body.counts).toMatchObject({ awaiting_transfer: 0, transfer_reported: 1, awaiting_payment: 0 })
    expect(list.body.items[0]).toMatchObject({ stage: 'transfer_reported', paymentMethod: 'bank_transfer' })
  })

  it('marks it paid, records who confirmed it, reduces stock, and sends the paid emails', async () => {
    const res = await act('transfer-received')
    expect(res.status).toBe(200)
    expect(res.body.order).toMatchObject({ paymentStatus: 'paid', stage: 'new', paymentMethod: 'bank_transfer', bankTransfer: BANK })
    expect(res.body.history[0]).toMatchObject({ action: 'order.payment', actor: { name: TEST_ADMIN.name }, changes: [{ field: 'paymentStatus', from: 'pending_payment', to: 'paid' }] })
    expect((await Product.findById('panel-001').lean())?.stockQuantity).toBe(3)
    await settle()
    expect(mailer.sent.map((message) => message.subject)).toEqual([`New paid order ${reference}`, `Your GPEC order ${reference} is paid`])
    expect(mailer.sent[1].text).not.toContain('Payment processing fee')

    // Confirming twice changes nothing more.
    const again = await act('transfer-received')
    expect(again.status).toBe(409)
    expect((await Product.findById('panel-001').lean())?.stockQuantity).toBe(3)
  })

  it('closes it as not received, recorded, after which it cannot be confirmed', async () => {
    const res = await act('transfer-not-received')
    expect(res.body.order).toMatchObject({ paymentStatus: 'failed', stage: 'payment_failed' })
    expect(res.body.history[0].changes).toEqual([{ field: 'paymentStatus', from: 'pending_payment', to: 'failed' }])
    expect((await act('transfer-received')).body.code).toBe('TRANSFER_ALREADY_SETTLED')
    expect((await Product.findById('panel-001').lean())?.stockQuantity).toBe(5)
  })

  it('lets only one of two simultaneous confirmations through', async () => {
    const results = await Promise.all([act('transfer-received'), act('transfer-received')])
    expect(results.map((res) => res.status).sort()).toEqual([200, 409])
    expect(await AuditRecord.countDocuments({ action: 'order.payment' })).toBe(1)
    expect((await Product.findById('panel-001').lean())?.stockQuantity).toBe(3)
  })

  it('is for admins only, from GPEC’s own site, with no body', async () => {
    expect((await request(app).post(`/api/admin/orders/${reference}/transfer-received`).send()).status).toBe(401)
    expect((await act('transfer-received', 'https://evil.example')).status).toBe(403)
    expect((await agent.post(`/api/admin/orders/${reference}/transfer-received`).set('Origin', ORIGIN).send({ amount: 1 })).status).toBe(400)
    expect((await Order.findOne({ reference }).lean())?.paymentStatus).toBe('pending_payment')
  })

  it('refuses a Paystack order: Paystack confirms those itself', async () => {
    const paystackApp = testApp({ payments: TEST_PAYMENTS }, null, undefined, null, paystack)
    const placed = await request(paystackApp).post('/api/checkout/orders').send({ ...customer, ...basket })
    const res = await agent.post(`/api/admin/orders/${placed.body.reference}/transfer-received`).set('Origin', ORIGIN).send()
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('NOT_A_TRANSFER')
  })
})

describe('Nigerian accounts only, for now', () => {
  it('offers bank transfer only while the shop currency is naira', async () => {
    await turnOnBankTransfer()
    const ghs = testApp({ currency: 'GHS' }, null, undefined, null, null)
    expect((await request(ghs).get('/api/checkout')).body).toMatchObject({ paymentMethods: [], bankTransfer: null })
    expect((await request(ghs).post('/api/checkout/quote').send({ ...basket, paymentMethod: 'bank_transfer' })).body.code).toBe('BANK_TRANSFER_UNAVAILABLE')
  })
})

describe('the sample bank details', () => {
  async function switchOnSample(target = agent) {
    return target.patch(SETTINGS).set('Origin', ORIGIN).send({ enabled: true })
  }

  it('can be tried in development, labelled "do not send money" everywhere', async () => {
    expect((await switchOnSample()).status).toBe(200)
    const checkout = await request(app).get('/api/checkout')
    expect(checkout.body.bankTransfer).toMatchObject({ ...SAMPLE_BANK_DETAILS, isSample: true })
    await settle()
    mailer.sent.length = 0
    const { body } = await placeTransferOrder()
    expect((await request(app).get(`/api/checkout/orders/${body.paymentReference}`)).body.bankTransfer.isSample).toBe(true)
    await settle()
    const toCustomer = mailer.sent.find((message) => message.to.includes(customer.email))
    expect(toCustomer?.text).toContain('SAMPLE DETAILS FOR TESTING: DO NOT SEND MONEY')
  })

  it('is offered on the live site too while it is being tested, still labelled', async () => {
    await BankTransferSettings.create({ ...SAMPLE_BANK_DETAILS, enabled: true })
    const live = testApp({ isProduction: true }, null, undefined, null, null)
    expect((await request(live).get('/api/checkout')).body).toMatchObject({ paymentMethods: ['bank_transfer'], bankTransfer: { isSample: true } })
  })

})
