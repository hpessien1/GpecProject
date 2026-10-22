import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import ContactRequest from '../src/models/ContactRequest.js'
import Order from '../src/models/Order.js'
import RequestNote from '../src/models/RequestNote.js'
import { assertDemoAllowed, removeDemoData, seedDemoData } from '../src/services/demoData.js'
import { TEST_ADMIN, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()
const ORIGIN = 'http://localhost:5173'
const LIST = '/api/admin/orders'
// From src/data/demoData.ts.
const NEW_DELIVERY = 'GPEC-O-2026-DE000001'
const PICKUP_PROCESSING = 'GPEC-O-2026-DE000002'
const AWAITING_PAYMENT = 'GPEC-O-2026-DE000008'
const PAYMENT_FAILED = 'GPEC-O-2026-DE000009'

let agent: TestAgent
beforeEach(async () => {
  await createTestAdmin()
  await seedDemoData()
  agent = await loggedInAgent(app)
})

function setStatus(reference: string, body: object, origin = ORIGIN) {
  return agent.patch(`${LIST}/${reference}`).set('Origin', origin).send(body)
}

describe('anonymous visitors see nothing', () => {
  it.each([
    ['get', LIST],
    ['get', `${LIST}/${NEW_DELIVERY}`],
    ['patch', `${LIST}/${NEW_DELIVERY}`],
    ['post', `${LIST}/${NEW_DELIVERY}/notes`],
  ] as const)('%s %s is 401 with no customer data', async (method, path) => {
    const res = await request(app)[method](path).send({ fulfilmentStatus: 'completed' })
    expect(res.status).toBe(401)
    expect(JSON.stringify(res.body)).not.toContain('example.com')
  })
})

describe('order list', () => {
  it('lists newest first, with a stage for each order and counts per stage', async () => {
    const res = await agent.get(LIST)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toMatchObject({ total: 10, page: 1, totalPages: 1 })
    expect(res.body.counts).toEqual({ awaiting_payment: 1, payment_failed: 1, new: 1, processing: 2, ready_for_pickup: 1, out_for_delivery: 1, completed: 2, cancelled: 1 })
    expect(res.body.items[0]).toMatchObject({
      reference: NEW_DELIVERY, stage: 'new', name: 'Adaeze Okafor', company: 'Brightline Facilities Ltd', fulfilmentMethod: 'delivery',
      summary: '1 × Custom control panel, 2 × Terminal block set', currency: { code: 'NGN', minorUnitDigits: 2 },
    })
    const times = res.body.items.map((item: { createdAt: string }) => Date.parse(item.createdAt))
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('filters by stage, including unpaid stages, and searches', async () => {
    expect((await agent.get(`${LIST}?stage=processing`)).body.items.map((item: { reference: string }) => item.reference).sort()).toEqual([PICKUP_PROCESSING, 'GPEC-O-2026-DE00000A'])
    expect((await agent.get(`${LIST}?stage=awaiting_payment`)).body.items.map((item: { reference: string }) => item.reference)).toEqual([AWAITING_PAYMENT])
    expect((await agent.get(`${LIST}?stage=payment_failed`)).body.items.map((item: { reference: string }) => item.reference)).toEqual([PAYMENT_FAILED])
    const search = (await agent.get(LIST).query({ q: 'cold rooms' })).body
    expect(search.items.map((item: { name: string }) => item.name)).toEqual(['Emeka Nwosu'])
    expect(search.counts.completed).toBe(1)
    expect((await agent.get(LIST).query({ q: '.*' })).body.total).toBe(0)
  })

  it.each(['stage=bogus', 'stage=paid', 'page=0', `q=${'x'.repeat(101)}`])('rejects ?%s', async (query) => {
    expect((await agent.get(`${LIST}?${query}`)).status).toBe(400)
  })
})

describe('order detail', () => {
  it('shows the customer, fulfilment, items with prices at order time, and totals that add up', async () => {
    const res = await agent.get(`${LIST}/${NEW_DELIVERY}`)
    expect(res.status).toBe(200)
    const { order } = res.body
    expect(order).toMatchObject({
      reference: NEW_DELIVERY, stage: 'new', paymentStatus: 'paid', fulfilmentStatus: 'new', fulfilmentMethod: 'delivery',
      deliveryAddress: '14 Admiralty Way, Lekki Phase 1, Lagos',
      customer: { fullName: 'Adaeze Okafor', email: 'adaeze.okafor@example.com' },
      items: [{ name: 'Custom control panel', unitPrice: 185000000, quantity: 1, lineTotal: 185000000 }, { name: 'Terminal block set', unitPrice: 4500000, quantity: 2, lineTotal: 9000000 }],
      currency: { code: 'NGN', minorUnitDigits: 2 }, subtotal: 194000000, deliveryFee: 1500000,
    })
    expect(order.paymentReference).toMatch(/^[0-9a-f]{24}$/)
    expect(order.paidAt).toEqual(expect.any(String))
    expect(order.total).toBe(order.subtotal + order.deliveryFee + order.paystackFee)
  })

  it('never shows a delivery address on a pickup order', async () => {
    expect((await agent.get(`${LIST}/${PICKUP_PROCESSING}`)).body.order).toMatchObject({ fulfilmentMethod: 'pickup', deliveryAddress: '', deliveryFee: 0 })
  })

  it('returns 404 for an unknown or malformed reference', async () => {
    expect((await agent.get(`${LIST}/GPEC-O-2026-FFFFFFFF`)).status).toBe(404)
    expect((await agent.get(`${LIST}/GPEC-C-2026-DE000001`)).status).toBe(404)
    expect((await agent.get(`${LIST}/nonsense`)).status).toBe(404)
  })
})

describe('moving an order along', () => {
  it('changes the fulfilment status and records who, from, to, and when', async () => {
    const res = await setStatus(NEW_DELIVERY, { fulfilmentStatus: 'processing' })
    expect(res.status).toBe(200)
    expect(res.body.order).toMatchObject({ stage: 'processing', fulfilmentStatus: 'processing', paymentStatus: 'paid' })
    expect(res.body.history[0]).toMatchObject({ actor: { name: TEST_ADMIN.name, email: TEST_ADMIN.email }, changes: [{ field: 'fulfilmentStatus', from: 'new', to: 'processing' }] })
    expect(await AuditRecord.findOne({ targetId: NEW_DELIVERY }).lean()).toMatchObject({ action: 'order.status', targetType: 'order' })
  })

  it('records nothing when the status is unchanged, and allows going back', async () => {
    await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'processing' })
    expect(await AuditRecord.countDocuments({ targetId: PICKUP_PROCESSING, 'actor.email': TEST_ADMIN.email, createdAt: { $gt: new Date(Date.now() - 60_000) } })).toBe(0)
    expect((await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'new' })).body.order.fulfilmentStatus).toBe('new')
  })

  it('keeps pickup and delivery steps apart', async () => {
    const pickup = await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'out_for_delivery' })
    expect(pickup.status).toBe(400)
    expect(pickup.body.errors.fulfilmentStatus).toBe('A pickup order cannot be out for delivery.')
    const delivery = await setStatus(NEW_DELIVERY, { fulfilmentStatus: 'ready_for_pickup' })
    expect(delivery.status).toBe(400)
    expect(delivery.body.errors.fulfilmentStatus).toBe('A delivery order cannot be ready for pickup.')
  })

  it('refuses to move an unpaid or failed order', async () => {
    for (const reference of [AWAITING_PAYMENT, PAYMENT_FAILED]) {
      const res = await setStatus(reference, { fulfilmentStatus: 'processing' })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('ORDER_NOT_PAID')
    }
    expect((await Order.findOne({ reference: AWAITING_PAYMENT }).lean())?.fulfilmentStatus).toBe('new')
  })

  it('never lets an admin change payment status, amounts, items, or customer details', async () => {
    for (const body of [{ paymentStatus: 'paid' }, { total: 1 }, { items: [] }, { customer: { email: 'x@example.com' } }, { fulfilmentStatus: 'completed', paymentStatus: 'paid' }]) {
      const res = await setStatus(AWAITING_PAYMENT, body)
      expect(res.status).toBe(400)
    }
    expect(await Order.findOne({ reference: AWAITING_PAYMENT }).lean()).toMatchObject({ paymentStatus: 'pending_payment', fulfilmentStatus: 'new' })
    expect((await setStatus(NEW_DELIVERY, { fulfilmentStatus: { $ne: '' } })).status).toBe(400)
  })

  it('refuses a change sent from another site', async () => {
    expect((await setStatus(NEW_DELIVERY, { fulfilmentStatus: 'completed' }, 'https://attacker.example')).status).toBe(403)
    expect((await Order.findOne({ reference: NEW_DELIVERY }).lean())?.fulfilmentStatus).toBe('new')
  })

  it('does not change the status if its history record cannot be saved', async () => {
    const spy = vi.spyOn(AuditRecord, 'create').mockRejectedValueOnce(new Error('audit write failed'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await setStatus(NEW_DELIVERY, { fulfilmentStatus: 'completed' })
    spy.mockRestore()
    log.mockRestore()
    expect(res.status).toBe(500)
    expect((await Order.findOne({ reference: NEW_DELIVERY }).lean())?.fulfilmentStatus).toBe('new')
  })
})

describe('order notes', () => {
  it('adds a note under the admin\'s name, newest first, without changing the order', async () => {
    const res = await agent.post(`${LIST}/${NEW_DELIVERY}/notes`).set('Origin', ORIGIN).send({ text: 'Customer confirmed the delivery address.' })
    expect(res.status).toBe(201)
    expect(res.body.notes[0]).toMatchObject({ author: { name: TEST_ADMIN.name }, text: 'Customer confirmed the delivery address.' })
    expect(res.body.order.fulfilmentStatus).toBe('new')
  })

  it('rejects an empty note and unknown fields', async () => {
    expect((await agent.post(`${LIST}/${NEW_DELIVERY}/notes`).set('Origin', ORIGIN).send({ text: ' ' })).status).toBe(400)
    expect((await agent.post(`${LIST}/${NEW_DELIVERY}/notes`).set('Origin', ORIGIN).send({ text: 'Hi', author: 'x' })).status).toBe(400)
  })
})

describe('demo data', () => {
  it('adds orders in every stage and contact requests in every status, with history and notes by the admin', async () => {
    expect(await Order.countDocuments()).toBe(10)
    const statuses = await ContactRequest.distinct('status')
    expect(statuses.sort()).toEqual(['closed', 'in_progress', 'new'])
    expect(await ContactRequest.countDocuments()).toBe(8)
    const history = (await agent.get(`${LIST}/GPEC-O-2026-DE000003`)).body
    expect(history.history.map((entry: { changes: { to: string }[] }) => entry.changes[0].to)).toEqual(['out_for_delivery', 'processing'])
    expect(history.notes).toHaveLength(1)
    expect(history.history[0].actor.email).toBe(TEST_ADMIN.email)
  })

  it('every order\'s totals add up and pickup orders have no address or delivery fee', async () => {
    for (const order of await Order.find().lean()) {
      expect(order.subtotal).toBe(order.items.reduce((sum, item) => sum + item.lineTotal, 0))
      for (const item of order.items) expect(item.lineTotal).toBe(item.unitPrice * item.quantity)
      expect(order.total).toBe(order.subtotal + order.deliveryFee + order.paystackFee)
    }
    const pickup = await Order.find({ fulfilmentMethod: 'pickup' }).lean()
    expect(pickup.length).toBeGreaterThan(0)
    expect(pickup.map((order) => [order.deliveryAddress, order.deliveryFee])).toEqual(pickup.map(() => ['', 0]))
    const unpaid = await Order.find({ paymentStatus: { $ne: 'paid' } }).lean()
    expect(unpaid.length).toBeGreaterThan(0)
    expect(unpaid.map((order) => order.paidAt)).toEqual(unpaid.map(() => null))
  })

  it('uses only reserved example email domains and unreachable phone numbers', async () => {
    const orders = await Order.find().lean()
    const contacts = await ContactRequest.find().lean()
    for (const email of [...orders.map((o) => o.customer?.email), ...contacts.map((c) => c.email)]) expect(email).toMatch(/@example\.(com|org)$/)
    for (const phone of [...orders.map((o) => o.customer?.phone), ...contacts.map((c) => c.phone)].filter(Boolean)) expect(phone).toMatch(/^\+234 000 /)
  })

  it('adds nothing the second time', async () => {
    expect(await seedDemoData()).toMatchObject({ orders: 0, contactRequests: 0 })
    expect(await Order.countDocuments()).toBe(10)
  })

  it('removes every demo record, history, and note, and nothing else', async () => {
    const real = await request(app).post('/api/contact-requests').send({ fullName: 'Real Customer', email: 'real@example.com', message: 'Hello' })
    await agent.post(`${LIST}/${NEW_DELIVERY}/notes`).set('Origin', ORIGIN).send({ text: 'Note' })
    expect(await removeDemoData()).toEqual({ orders: 10, contactRequests: 8 })
    expect(await Order.countDocuments()).toBe(0)
    expect(await ContactRequest.find().lean()).toMatchObject([{ reference: real.body.reference }])
    expect(await AuditRecord.countDocuments({ targetType: { $in: ['order', 'contactRequest'] } })).toBe(0)
    expect(await RequestNote.countDocuments()).toBe(0)
  })

  it('without an admin account, adds the records but no history or notes', async () => {
    await removeDemoData()
    const { default: AdminUser } = await import('../src/models/AdminUser.js')
    await AdminUser.deleteMany({})
    expect(await seedDemoData()).toEqual({ orders: 10, contactRequests: 8, withHistory: false })
    expect(await AuditRecord.countDocuments({ targetType: 'order' })).toBe(0)
  })

  it.each([['gpec', 'development'], ['gpec_dev', 'production'], ['gpec', 'production']])('refuses database %s with NODE_ENV %s without --production', (database, nodeEnv) => {
    expect(() => assertDemoAllowed(database, nodeEnv, false)).toThrow('Add --production to change the live database on purpose.')
  })

  it('allows the live database only with --production', () => {
    expect(() => assertDemoAllowed('gpec', 'production', true)).not.toThrow()
  })

  it('allows the development database', () => {
    expect(() => assertDemoAllowed('gpec_dev', 'development', false)).not.toThrow()
  })
})
