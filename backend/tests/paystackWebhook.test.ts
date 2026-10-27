import { createHmac } from 'node:crypto'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import BankTransferSettings from '../src/models/BankTransferSettings.js'
import Order from '../src/models/Order.js'
import Product from '../src/models/Product.js'
import WebhookEvent from '../src/models/WebhookEvent.js'
import { seedSampleProducts } from '../src/services/products.js'
import { FakePaystack, RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, TEST_PAYMENTS, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()

const WEBHOOK = '/api/paystack/webhook'
let paystack: FakePaystack
let mailer: RecordingMailer
let app: ReturnType<typeof testApp>
let reference: string
let orderReference: string
let total: number

function sign(body: string, key = TEST_PAYMENTS.secretKey) {
  return createHmac('sha512', key).update(body).digest('hex')
}

function deliver(payload: object, signature?: string) {
  const body = JSON.stringify(payload)
  return request(app).post(WEBHOOK).set('Content-Type', 'application/json').set('x-paystack-signature', signature ?? sign(body)).send(body)
}

function charge(event: string, override: object = {}) {
  return { event, data: { id: 4099260516, reference, status: event === 'charge.success' ? 'success' : 'failed', amount: total, currency: 'NGN', ...override } }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

beforeEach(async () => {
  paystack = new FakePaystack()
  mailer = new RecordingMailer()
  app = testApp({ payments: TEST_PAYMENTS, email: TEST_EMAIL_SETTINGS }, mailer, undefined, null, paystack)
  await seedSampleProducts()
  await Product.updateOne({ _id: 'panel-001' }, { price: 150_000 })
  const res = await request(app).post('/api/checkout/orders').send({ fullName: 'Ngozi Test', email: 'ngozi@example.com', phone: '+234 803 000 0000', items: [{ productId: 'panel-001', quantity: 1 }], fulfilmentMethod: 'pickup' })
  reference = paystack.started[0].reference
  orderReference = res.body.reference
  total = (await Order.findOne({ reference: res.body.reference }).lean())?.total ?? 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function paymentStatus() {
  return (await Order.findById(reference).lean())?.paymentStatus
}

describe('Paystack webhook', () => {
  it('marks the order paid on a signed charge.success with the right amount and currency, and emails', async () => {
    const res = await deliver(charge('charge.success'))
    expect(res.status).toBe(200)
    expect(await paymentStatus()).toBe('paid')
    await settle()
    expect(mailer.sent).toHaveLength(2)
    expect(await WebhookEvent.findOne().lean()).toMatchObject({ eventId: 'charge.success:4099260516', event: 'charge.success', reference, outcome: 'processed' })
  })

  it('skips a repeated delivery: one record, one set of emails', async () => {
    await deliver(charge('charge.success'))
    const again = await deliver(charge('charge.success'))
    expect(again.status).toBe(200)
    await settle()
    expect(mailer.sent).toHaveLength(2)
    expect(await WebhookEvent.countDocuments()).toBe(1)
  })

  // Audit M-07: the server stopped after noting the event and before the order was paid. Paystack's
  // retry must do the work, not be skipped as a repeat.
  it('does the work again when an earlier delivery was received but never finished', async () => {
    await WebhookEvent.create({ eventId: 'charge.success:4099260516', event: 'charge.success', reference, outcome: 'received' })
    const res = await deliver(charge('charge.success'))
    expect(res.status).toBe(200)
    expect(await paymentStatus()).toBe('paid')
    await settle()
    expect(mailer.sent).toHaveLength(2)
    expect(await WebhookEvent.find().lean()).toEqual([expect.objectContaining({ eventId: 'charge.success:4099260516', outcome: 'processed' })])
  })

  it('redoes an unfinished charge.failed too', async () => {
    await WebhookEvent.create({ eventId: 'charge.failed:4099260516', event: 'charge.failed', reference, outcome: 'received' })
    expect((await deliver(charge('charge.failed'))).status).toBe(200)
    expect(await paymentStatus()).toBe('failed')
  })

  it('keeps the event as received while the work fails, so the retry pays the order', async () => {
    vi.spyOn(Order, 'findById').mockImplementationOnce(() => { throw new Error('database unavailable') })
    expect((await deliver(charge('charge.success'))).status).toBe(500)
    expect(await paymentStatus()).toBe('pending_payment')
    expect(await WebhookEvent.findOne().lean()).toMatchObject({ outcome: 'received' })
    expect((await deliver(charge('charge.success'))).status).toBe(200)
    expect(await paymentStatus()).toBe('paid')
    expect(await WebhookEvent.findOne().lean()).toMatchObject({ outcome: 'processed' })
  })

  it('agrees with the return-page check arriving at the same time: one payment, one set of emails', async () => {
    paystack.results.set(reference, { reference, status: 'success', amount: total, currency: 'NGN' })
    await Promise.all([deliver(charge('charge.success')), request(app).get(`/api/checkout/orders/${reference}`)])
    await settle()
    expect(await paymentStatus()).toBe('paid')
    expect(mailer.sent).toHaveLength(2)
  })

  it.each([
    ['amount', { amount: 100 }],
    ['currency', { currency: 'USD' }],
  ])('does not mark paid when the %s differs from the order', async (_name, override) => {
    expect((await deliver(charge('charge.success', override))).status).toBe(200)
    expect(await paymentStatus()).toBe('pending_payment')
  })

  it('never moves a paid order back on a late charge.failed', async () => {
    await deliver(charge('charge.success'))
    await deliver(charge('charge.failed', { id: 4099260999 }))
    expect(await paymentStatus()).toBe('paid')
  })

  it('records charge.failed on an unpaid order', async () => {
    await deliver(charge('charge.failed'))
    expect(await paymentStatus()).toBe('failed')
  })

  it.each([
    ['no signature', (body: string) => request(app).post(WEBHOOK).set('Content-Type', 'application/json').send(body)],
    ['a wrong signature', (body: string) => request(app).post(WEBHOOK).set('Content-Type', 'application/json').set('x-paystack-signature', sign(body, 'sk_test_wrong')).send(body)],
    ['a malformed signature', (body: string) => request(app).post(WEBHOOK).set('Content-Type', 'application/json').set('x-paystack-signature', 'abc').send(body)],
    ['a signature over a different body', (body: string) => request(app).post(WEBHOOK).set('Content-Type', 'application/json').set('x-paystack-signature', sign(`${body} `)).send(body)],
  ])('quietly refuses %s with 400 and changes nothing', async (_name, send) => {
    const res = await send(JSON.stringify(charge('charge.success')))
    expect(res.status).toBe(400)
    expect(await paymentStatus()).toBe('pending_payment')
    expect(await WebhookEvent.countDocuments()).toBe(0)
  })

  it('refuses a signed body that is not JSON with 400, not 500', async () => {
    const body = '{not json'
    const res = await request(app).post(WEBHOOK).set('Content-Type', 'application/json').set('x-paystack-signature', sign(body)).send(body)
    expect(res.status).toBe(400)
  })

  it('acknowledges events it does not handle, and payments that are not GPEC orders, without changing anything', async () => {
    expect((await deliver({ event: 'transfer.success', data: { id: 1, reference: 'x' } })).status).toBe(200)
    expect((await deliver(charge('charge.success', { reference: 'someone-elses-ref' }))).status).toBe(200)
    expect(await paymentStatus()).toBe('pending_payment')
    expect(await WebhookEvent.find().select('outcome').lean()).toEqual([expect.objectContaining({ outcome: 'ignored' }), expect.objectContaining({ outcome: 'ignored' })])
  })

  it('answers 503 while payments are not configured', async () => {
    const off = testApp()
    const body = JSON.stringify(charge('charge.success'))
    expect((await request(off).post(WEBHOOK).set('Content-Type', 'application/json').set('x-paystack-signature', sign(body)).send(body)).status).toBe(503)
  })
})

// Audit M-07: a payment Paystack took that the site never heard about (the webhook's work was cut
// off and the customer closed the tab). Staff ask Paystack themselves; the order becomes paid only on
// Paystack's word, through the same markOrderPaid.
describe('staff checking a payment with Paystack', () => {
  const ORIGIN = 'http://localhost:5173'
  let agent: Awaited<ReturnType<typeof loggedInAgent>>

  beforeEach(async () => {
    await createTestAdmin()
    agent = await loggedInAgent(app)
    await settle()
    mailer.sent.length = 0
  })

  function check(path = orderReference, origin = ORIGIN) {
    return agent.post(`/api/admin/orders/${path}/check-payment`).set('Origin', origin).send()
  }

  function reports(status: string, override: object = {}) {
    paystack.results.set(reference, { reference, status, amount: total, currency: 'NGN', ...override })
  }

  it('says on the order whether payments are on, so the screen can offer the check', async () => {
    expect((await agent.get(`/api/admin/orders/${orderReference}`)).body.paystackOn).toBe(true)
    const off = testApp()
    expect((await (await loggedInAgent(off)).get(`/api/admin/orders/${orderReference}`)).body.paystackOn).toBe(false)
  })

  it('marks the order paid when Paystack confirms it, recording who asked, and sends the paid emails', async () => {
    reports('success')
    const res = await check()
    expect(res.status).toBe(200)
    expect(res.body.paymentCheck).toBe('paid')
    expect(res.body.order).toMatchObject({ paymentStatus: 'paid', stage: 'new' })
    expect(res.body.history[0]).toMatchObject({ action: 'order.payment', actor: { name: TEST_ADMIN.name }, changes: [{ field: 'paymentStatus', from: 'pending_payment', to: 'paid' }] })
    expect(paystack.verified).toEqual([reference])
    await settle()
    expect(mailer.sent.map((message) => message.subject)).toEqual([`New paid order ${orderReference}`, `Your GPEC order ${orderReference} is paid`])
  })

  it('pays an order an earlier failed attempt marked failed, if Paystack now reports success', async () => {
    await Order.updateOne({ _id: reference }, { paymentStatus: 'failed' })
    reports('success')
    const res = await check()
    expect(res.body.paymentCheck).toBe('paid')
    expect(res.body.history[0].changes).toEqual([{ field: 'paymentStatus', from: 'failed', to: 'paid' }])
  })

  it.each([
    ['Paystack has no such payment', null, 'not_found'],
    ['the payment was abandoned', 'abandoned', 'not_paid'],
    ['the payment is still going on', 'ongoing', 'not_paid'],
  ])('changes nothing when %s', async (_name, status, outcome) => {
    if (status) reports(status)
    const res = await check()
    expect(res.status).toBe(200)
    expect(res.body.paymentCheck).toBe(outcome)
    expect(await paymentStatus()).toBe('pending_payment')
    expect(await AuditRecord.countDocuments({ action: 'order.payment' })).toBe(0)
  })

  it('marks the order failed, recorded, when Paystack reports a failed payment', async () => {
    reports('failed')
    const res = await check()
    expect(res.body.paymentCheck).toBe('failed')
    expect(res.body.order).toMatchObject({ paymentStatus: 'failed', stage: 'payment_failed' })
    expect(res.body.history[0]).toMatchObject({ action: 'order.payment', actor: { name: TEST_ADMIN.name }, changes: [{ field: 'paymentStatus', from: 'pending_payment', to: 'failed' }] })
    // Asking again changes and records nothing more.
    expect((await check()).body.paymentCheck).toBe('failed')
    expect(await AuditRecord.countDocuments({ action: 'order.payment' })).toBe(1)
  })

  it.each([
    ['amount', { amount: 100 }],
    ['currency', { currency: 'USD' }],
  ])('does not mark paid when Paystack reports a different %s', async (_name, override) => {
    reports('success', override)
    expect((await check()).body.paymentCheck).toBe('mismatch')
    expect(await paymentStatus()).toBe('pending_payment')
    expect(await AuditRecord.countDocuments({ action: 'order.payment' })).toBe(0)
  })

  it('ignores an answer about a different transaction', async () => {
    paystack.results.set(reference, { reference: 'another-reference', status: 'success', amount: total, currency: 'NGN' })
    expect((await check()).body.paymentCheck).toBe('not_found')
    expect(await paymentStatus()).toBe('pending_payment')
  })

  it('says an order the webhook already paid is paid, without asking Paystack or recording anything', async () => {
    await deliver(charge('charge.success'))
    const res = await check()
    expect(res.body.paymentCheck).toBe('already_paid')
    expect(paystack.verified).toEqual([])
    expect(await AuditRecord.countDocuments({ action: 'order.payment' })).toBe(0)
  })

  it('agrees with the webhook arriving at the same time: one payment, one set of emails', async () => {
    reports('success')
    const [, res] = await Promise.all([deliver(charge('charge.success')), check()])
    expect(['paid', 'already_paid']).toContain(res.body.paymentCheck)
    expect(await paymentStatus()).toBe('paid')
    await settle()
    expect(mailer.sent).toHaveLength(2)
    expect(await AuditRecord.countDocuments({ action: 'order.payment' })).toBeLessThanOrEqual(1)
  })

  it('answers 502 when Paystack cannot be reached, changing nothing', async () => {
    paystack.failVerify = true
    const res = await check()
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('PAYMENT_CHECK_FAILED')
    expect(await paymentStatus()).toBe('pending_payment')
  })

  it('answers 503 while payments are not configured', async () => {
    const off = testApp()
    const offAgent = await loggedInAgent(off)
    const res = await offAgent.post(`/api/admin/orders/${orderReference}/check-payment`).set('Origin', ORIGIN).send()
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PAYMENT_CONFIG_ERROR')
  })

  it('refuses a bank-transfer order: staff confirm those themselves', async () => {
    await BankTransferSettings.create({ enabled: true, bankName: 'Sample Bank', accountName: 'GPEC', accountNumber: '0123456789', instructions: '', payWithinDays: 3 })
    const placed = await request(app).post('/api/checkout/orders').send({ fullName: 'Ngozi Test', email: 'ngozi@example.com', phone: '+234 803 000 0000', items: [{ productId: 'panel-001', quantity: 1 }], fulfilmentMethod: 'pickup', paymentMethod: 'bank_transfer' })
    paystack.results.set(placed.body.paymentReference, { reference: placed.body.paymentReference, status: 'success', amount: 150_000, currency: 'NGN' })
    const res = await check(placed.body.reference)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('NOT_A_PAYSTACK_ORDER')
    expect(paystack.verified).toEqual([])
    expect((await Order.findOne({ reference: placed.body.reference }).lean())?.paymentStatus).toBe('pending_payment')
  })

  it('is for admins only, from GPEC’s own site, with no body', async () => {
    reports('success')
    expect((await request(app).post(`/api/admin/orders/${orderReference}/check-payment`).send()).status).toBe(401)
    expect((await check(orderReference, 'https://evil.example')).status).toBe(403)
    expect((await agent.post(`/api/admin/orders/${orderReference}/check-payment`).set('Origin', ORIGIN).send({ paymentStatus: 'paid' })).status).toBe(400)
    expect((await check('GPEC-O-2026-ZZZZZZZZ')).status).toBe(404)
    expect(await paymentStatus()).toBe('pending_payment')
  })
})
