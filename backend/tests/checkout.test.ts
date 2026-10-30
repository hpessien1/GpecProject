import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import DeliveryArea from '../src/models/DeliveryArea.js'
import Order from '../src/models/Order.js'
import Product from '../src/models/Product.js'
import { markOrderPaid } from '../src/services/checkout.js'
import { createNotifier } from '../src/services/notifications.js'
import { seedSampleProducts } from '../src/services/products.js'
import { FakePaystack, RecordingMailer, TEST_EMAIL_SETTINGS, TEST_PAYMENTS, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()

let paystack: FakePaystack
let mailer: RecordingMailer
let app: ReturnType<typeof testApp>
let areaId: string

const customer = { fullName: 'Ngozi Test', company: '', email: 'ngozi@example.com', phone: '+234 803 000 0000' }

beforeEach(async () => {
  paystack = new FakePaystack()
  mailer = new RecordingMailer()
  app = testApp({ payments: TEST_PAYMENTS, email: TEST_EMAIL_SETTINGS }, mailer, undefined, null, paystack)
  await seedSampleProducts()
  // ₦1,500.00 and ₦250.00, in kobo.
  await Product.updateOne({ _id: 'panel-001' }, { price: 150_000 })
  await Product.updateOne({ _id: 'terminal-001' }, { price: 25_000 })
  const area = await DeliveryArea.create({ name: 'Port Harcourt', description: 'Woji, GRA, Trans-Amadi', fee: 300_000 })
  areaId = String(area._id)
})

const pickupBasket = { items: [{ productId: 'panel-001', quantity: 2 }, { productId: 'terminal-001', quantity: 1 }], fulfilmentMethod: 'pickup' }

function quote(body: object) {
  return request(app).post('/api/checkout/quote').send(body)
}

function placeOrder(body: object) {
  return request(app).post('/api/checkout/orders').send({ ...customer, ...body })
}

async function paidResult(reference: string, override: Partial<{ status: string, amount: number, currency: string }> = {}) {
  const order = await Order.findById(reference).lean()
  return { reference, status: 'success', amount: order?.total ?? 0, currency: 'NGN', ...override }
}

describe('GET /api/checkout', () => {
  it('says payment is on, in test mode, with the active delivery areas and their fees', async () => {
    await DeliveryArea.create({ name: 'Old area', fee: 100, status: 'archived' })
    const res = await request(app).get('/api/checkout')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      paymentsAvailable: true,
      paymentMethods: ['paystack'],
      testMode: true,
      currency: { code: 'NGN', minorUnitDigits: 2 },
      bankTransfer: null,
      deliveryAreas: [{ id: areaId, name: 'Port Harcourt', description: 'Woji, GRA, Trans-Amadi', fee: 300_000 }],
    })
  })

  it('says payment is off while Paystack or the currency is not configured', async () => {
    for (const off of [testApp({}, null, undefined, null, null), testApp({ payments: TEST_PAYMENTS, currency: null }, null, undefined, null, paystack)]) {
      const res = await request(off).get('/api/checkout')
      expect(res.body).toMatchObject({ paymentsAvailable: false, testMode: false, deliveryAreas: [] })
      expect((await request(off).post('/api/checkout/orders').send({ ...customer, ...pickupBasket })).body.code).toBe('PAYMENT_CONFIG_ERROR')
      expect((await request(off).post('/api/checkout/quote').send(pickupBasket)).status).toBe(503)
    }
  })
})

describe('order summary (quote)', () => {
  it('prices pickup from the server’s own prices, with the Paystack fee and no delivery fee', async () => {
    const res = await quote(pickupBasket)
    expect(res.status).toBe(200)
    // 2 × ₦1,500 + ₦250 = ₦3,250; fee: ₦3,250 + ₦100 grossed up at 1.5% = ₦3,401.02 charged.
    expect(res.body).toMatchObject({ subtotal: 325_000, deliveryFee: 0, paystackFee: 15_102, total: 340_102, deliveryAreaName: null, currency: { code: 'NGN' } })
    expect(res.body.items).toEqual([
      { productId: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', unitPrice: 150_000, quantity: 2, lineTotal: 300_000 },
      { productId: 'terminal-001', name: 'Terminal block set', reference: 'GPEC-TB-074', unitPrice: 25_000, quantity: 1, lineTotal: 25_000 },
    ])
  })

  it('adds the chosen area’s delivery fee, and the Paystack fee on top of it', async () => {
    const res = await quote({ ...pickupBasket, fulfilmentMethod: 'delivery', deliveryAreaId: areaId })
    expect(res.body).toMatchObject({ subtotal: 325_000, deliveryFee: 300_000, deliveryAreaName: 'Port Harcourt' })
    expect(res.body.total).toBe(625_000 + res.body.paystackFee)
  })

  it.each([
    [{ ...pickupBasket, items: [{ productId: 'panel-001', quantity: 1, unitPrice: 1 }] }, 'items'],
    [{ ...pickupBasket, total: 100 }, 'total'],
    [{ ...pickupBasket, currency: 'USD' }, 'currency'],
    [{ ...pickupBasket, deliveryFee: 0 }, 'deliveryFee'],
    [{ ...pickupBasket, items: [] }, 'items'],
    [{ ...pickupBasket, items: [{ productId: 'panel-001', quantity: 0 }] }, 'items'],
    [{ ...pickupBasket, items: [{ productId: 'panel-001', quantity: 1001 }] }, 'items'],
    [{ ...pickupBasket, items: [{ productId: 'panel-001', quantity: '2' }] }, 'items'],
    [{ ...pickupBasket, items: [{ productId: { $gt: '' }, quantity: 1 }] }, 'items'],
    [{ ...pickupBasket, items: [{ productId: 'panel-001', quantity: 1 }, { productId: 'panel-001', quantity: 1 }] }, 'items'],
    [{ ...pickupBasket, fulfilmentMethod: 'courier' }, 'fulfilmentMethod'],
    [{ ...pickupBasket, fulfilmentMethod: 'delivery' }, 'deliveryAreaId'],
  ])('refuses %j (a tampered price, fee, or total is never accepted)', async (body, field) => {
    const res = await quote(body)
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.errors)).toContain(field)
  })

  it.each([
    ['an unknown product', async () => undefined, [{ productId: 'nope-001', quantity: 1 }], 'PRODUCT_UNAVAILABLE'],
    ['an archived product', async () => { await Product.updateOne({ _id: 'panel-001' }, { status: 'archived' }) }, [{ productId: 'panel-001', quantity: 1 }], 'PRODUCT_UNAVAILABLE'],
    ['an out-of-stock product', async () => { await Product.updateOne({ _id: 'panel-001' }, { outOfStock: true }) }, [{ productId: 'panel-001', quantity: 1 }], 'OUT_OF_STOCK'],
    ['a counted stock of 0', async () => { await Product.updateOne({ _id: 'panel-001' }, { stockQuantity: 0 }) }, [{ productId: 'panel-001', quantity: 1 }], 'OUT_OF_STOCK'],
    ['more than the counted stock', async () => { await Product.updateOne({ _id: 'panel-001' }, { stockQuantity: 3 }) }, [{ productId: 'panel-001', quantity: 4 }], 'NOT_ENOUGH_STOCK'],
    ['an unpriced product', async () => undefined, [{ productId: 'solar-001', quantity: 1 }], 'PRICE_NOT_SET'],
  ])('refuses %s, naming it', async (_name, prepare, items, code) => {
    await prepare()
    const res = await quote({ ...pickupBasket, items })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe(code)
    expect(Object.keys(res.body.errors)).toEqual([items[0].productId])
  })

  it('never tells the customer the stock count', async () => {
    await Product.updateOne({ _id: 'panel-001' }, { stockQuantity: 3 })
    const res = await quote({ ...pickupBasket, items: [{ productId: 'panel-001', quantity: 4 }] })
    expect(JSON.stringify(res.body)).not.toMatch(/\b3\b/)
  })

  it('refuses delivery for a pickup-only product, but allows pickup', async () => {
    await Product.updateOne({ _id: 'panel-001' }, { deliveryAvailable: false })
    const delivery = await quote({ ...pickupBasket, fulfilmentMethod: 'delivery', deliveryAreaId: areaId })
    expect(delivery.status).toBe(409)
    expect(delivery.body).toMatchObject({ code: 'PICKUP_ONLY', errors: { 'panel-001': 'Pickup only.' } })
    expect((await quote(pickupBasket)).status).toBe(200)
  })

  it('refuses an archived or unknown delivery area', async () => {
    await DeliveryArea.updateOne({ _id: areaId }, { status: 'archived' })
    const res = await quote({ ...pickupBasket, fulfilmentMethod: 'delivery', deliveryAreaId: areaId })
    expect(res.body.code).toBe('DELIVERY_AREA_UNAVAILABLE')
    const unknown = await quote({ ...pickupBasket, fulfilmentMethod: 'delivery', deliveryAreaId: '0123456789abcdef01234567' })
    expect(unknown.body.code).toBe('DELIVERY_AREA_UNAVAILABLE')
  })
})

describe('placing an order', () => {
  it('creates an unpaid order with server prices and starts a Paystack payment for exactly its total', async () => {
    const res = await placeOrder({ ...pickupBasket, notes: 'Collect on Friday' })
    expect(res.status).toBe(201)
    expect(res.body.reference).toMatch(/^GPEC-O-\d{4}-[0-9A-F]{8}$/)
    const order = await Order.findOne({ reference: res.body.reference }).lean()
    expect(order).toMatchObject({ paymentStatus: 'pending_payment', fulfilmentMethod: 'pickup', deliveryAddress: '', deliveryArea: null, customerNotes: 'Collect on Friday', currency: 'NGN', subtotal: 325_000, total: 340_102 })
    expect(paystack.started).toEqual([{
      reference: String(order?._id),
      email: 'ngozi@example.com',
      amount: 340_102,
      currency: 'NGN',
      callbackUrl: 'https://www.example.com/shop/payment-complete',
      orderReference: res.body.reference,
    }])
    expect(res.body.authorizationUrl).toBe(`https://checkout.paystack.com/test-${order?._id}`)
  })

  it('keeps the delivery address and a copy of the area for delivery orders', async () => {
    const res = await placeOrder({ ...pickupBasket, fulfilmentMethod: 'delivery', deliveryAreaId: areaId, deliveryAddress: '12 Test Road, Woji' })
    expect(res.status).toBe(201)
    const order = await Order.findOne({ reference: res.body.reference }).lean()
    expect(order).toMatchObject({ deliveryAddress: '12 Test Road, Woji', deliveryArea: { areaId, name: 'Port Harcourt' }, deliveryFee: 300_000 })
    // A later change to the area does not change the order.
    await DeliveryArea.updateOne({ _id: areaId }, { fee: 999_999, name: 'Renamed' })
    expect((await Order.findById(order?._id).lean())?.deliveryArea?.name).toBe('Port Harcourt')
  })

  // Audit S4-L01: the email ends up in staff's "email the customer" link.
  it('refuses an email that would add recipients to staff’s email link', async () => {
    const res = await placeOrder({ ...pickupBasket, email: 'customer@example.invalid?bcc=audit-copy%40example.invalid&x=' })
    expect(res.status).toBe(400)
    expect(res.body.errors.email).toBe('email must be valid.')
    expect(await Order.countDocuments()).toBe(0)
  })

  it('uses random, unguessable payment references', async () => {
    const first = await placeOrder(pickupBasket)
    const second = await placeOrder(pickupBasket)
    const [a, b] = paystack.started.map((transaction) => transaction.reference)
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    // A default ObjectId shares its first 8 characters (the time) and counts up in its last 6.
    expect(a.slice(0, 8)).not.toBe(b.slice(0, 8))
  })

  it.each([
    [{ fullName: '' }, 'fullName'],
    [{ email: 'not-an-email' }, 'email'],
    [{ phone: '' }, 'phone'],
    [{ phone: 'call me' }, 'phone'],
    [{ deliveryAddress: '12 Road' }, 'deliveryAddress'],
    [{ fulfilmentMethod: 'delivery', deliveryAreaId: 'AREA' }, 'deliveryAreaId'],
    [{ paymentStatus: 'paid' }, 'paymentStatus'],
    [{ callbackUrl: 'https://evil.example' }, 'callbackUrl'],
    [{ reference: 'GPEC-O-2026-00000000' }, 'reference'],
  ])('refuses %j and saves nothing', async (override, field) => {
    const res = await placeOrder({ ...pickupBasket, ...override })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.errors)).toContain(field)
    expect(await Order.countDocuments()).toBe(0)
    expect(paystack.started).toHaveLength(0)
  })

  it('requires a delivery address for delivery', async () => {
    const res = await placeOrder({ ...pickupBasket, fulfilmentMethod: 'delivery', deliveryAreaId: areaId })
    expect(res.body.errors).toHaveProperty('deliveryAddress')
  })

  it('refuses an out-of-stock product on the server, whatever the browser shows', async () => {
    await Product.updateOne({ _id: 'terminal-001' }, { outOfStock: true })
    const res = await placeOrder(pickupBasket)
    expect(res.body.code).toBe('OUT_OF_STOCK')
    expect(await Order.countDocuments()).toBe(0)
  })

  it('removes the order when Paystack does not start the payment', async () => {
    paystack.failInitialize = true
    const res = await placeOrder(pickupBasket)
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('PAYMENT_START_FAILED')
    expect(await Order.countDocuments()).toBe(0)
  })

  it('saves nothing and starts no payment when the spam trap is filled in, but looks normal', async () => {
    const res = await placeOrder({ ...pickupBasket, website: 'https://spam.example' })
    expect(res.status).toBe(201)
    expect(res.body.reference).toMatch(/^GPEC-O-/)
    expect(await Order.countDocuments()).toBe(0)
    expect(paystack.started).toHaveLength(0)
  })
})

describe('after paying: the return page check and markOrderPaid', () => {
  async function startPaidOrder(body: object = pickupBasket) {
    const res = await placeOrder(body)
    const reference = paystack.started.at(-1)?.reference ?? ''
    return { orderReference: res.body.reference as string, reference }
  }

  it('marks the order paid only after Paystack confirms it, shows no personal details, and emails once', async () => {
    const { orderReference, reference } = await startPaidOrder()
    const before = await request(app).get(`/api/checkout/orders/${reference}`)
    expect(before.body.paymentStatus).toBe('pending_payment')

    paystack.results.set(reference, await paidResult(reference))
    const res = await request(app).get(`/api/checkout/orders/${reference}`)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toMatchObject({ reference: orderReference, paymentStatus: 'paid', fulfilmentMethod: 'pickup', total: 340_102 })
    expect(JSON.stringify(res.body)).not.toMatch(/ngozi|803 000/i)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mailer.sent.map((message) => message.to)).toEqual([TEST_EMAIL_SETTINGS.staffRecipients, ['ngozi@example.com']])
    expect(mailer.sent[1].text).toContain('#19 King Slope Street, Woji')

    // Checking again (a refresh) does not ask Paystack or send anything again.
    const checks = paystack.verified.length
    await request(app).get(`/api/checkout/orders/${reference}`)
    expect(paystack.verified).toHaveLength(checks)
    expect(mailer.sent).toHaveLength(2)
  })

  it('does not mark paid when the amount or currency differs, or Paystack does not report success', async () => {
    const { reference } = await startPaidOrder()
    for (const override of [{ amount: 100 }, { currency: 'GHS' }, { status: 'abandoned' }]) {
      paystack.results.set(reference, await paidResult(reference, override))
      const res = await request(app).get(`/api/checkout/orders/${reference}`)
      expect(res.body.paymentStatus).toBe('pending_payment')
    }
    expect(mailer.sent).toHaveLength(0)
  })

  it('records a failed payment, and a later success on the same reference still counts', async () => {
    const { reference } = await startPaidOrder()
    paystack.results.set(reference, await paidResult(reference, { status: 'failed' }))
    expect((await request(app).get(`/api/checkout/orders/${reference}`)).body.paymentStatus).toBe('failed')
    paystack.results.set(reference, await paidResult(reference))
    expect((await request(app).get(`/api/checkout/orders/${reference}`)).body.paymentStatus).toBe('paid')
  })

  it('answers 502 when Paystack cannot be reached, leaving the order as it was', async () => {
    const { reference } = await startPaidOrder()
    paystack.failVerify = true
    const res = await request(app).get(`/api/checkout/orders/${reference}`)
    expect(res.status).toBe(502)
    expect(res.body.code).toBe('PAYMENT_CHECK_FAILED')
    expect((await Order.findById(reference).lean())?.paymentStatus).toBe('pending_payment')
  })

  it('answers 404 for an unknown or malformed reference', async () => {
    expect((await request(app).get('/api/checkout/orders/0123456789abcdef01234567')).status).toBe(404)
    expect((await request(app).get('/api/checkout/orders/GPEC-O-2026-00000000')).status).toBe(404)
  })

  it('lets only one of two simultaneous confirmations win, so emails and stock change once', async () => {
    await Product.updateOne({ _id: 'panel-001' }, { stockQuantity: 5 })
    const { reference } = await startPaidOrder()
    const result = await paidResult(reference)
    const notifier = createNotifier(mailer, TEST_EMAIL_SETTINGS)
    const outcomes = await Promise.all([markOrderPaid(result, notifier), markOrderPaid(result, notifier), markOrderPaid(result, notifier)])
    expect(outcomes.filter((outcome) => outcome === 'paid')).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mailer.sent).toHaveLength(2)
    expect((await Product.findById('panel-001').lean())?.stockQuantity).toBe(3)
  })

  it('reduces counted stock on payment (never below 0), records it, and leaves uncounted stock alone', async () => {
    await Product.updateOne({ _id: 'panel-001' }, { stockQuantity: 2 })
    const { orderReference, reference } = await startPaidOrder()
    // Someone else's sale took the last unit while this customer was paying.
    await Product.updateOne({ _id: 'panel-001' }, { stockQuantity: 1 })
    await markOrderPaid(await paidResult(reference), createNotifier(null, null))
    expect((await Product.findById('panel-001').lean())?.stockQuantity).toBe(0)
    expect((await Product.findById('terminal-001').lean())?.stockQuantity).toBeNull()
    const [record] = await AuditRecord.find({ targetId: 'panel-001' }).lean()
    expect(record).toMatchObject({ action: 'product.sale', orderReference, actor: null, changes: [{ field: 'stockQuantity', from: 1, to: 0 }] })
  })
})
