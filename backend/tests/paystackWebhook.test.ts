import { createHmac } from 'node:crypto'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import Order from '../src/models/Order.js'
import Product from '../src/models/Product.js'
import WebhookEvent from '../src/models/WebhookEvent.js'
import { seedSampleProducts } from '../src/services/products.js'
import { FakePaystack, RecordingMailer, TEST_EMAIL_SETTINGS, TEST_PAYMENTS, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()

const WEBHOOK = '/api/paystack/webhook'
let paystack: FakePaystack
let mailer: RecordingMailer
let app: ReturnType<typeof testApp>
let reference: string
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
  total = (await Order.findOne({ reference: res.body.reference }).lean())?.total ?? 0
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
