import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import Order from '../src/models/Order.js'
import { seedDemoData } from '../src/services/demoData.js'
import { RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, createTestAdmin, loggedInAgent, noBreaches, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const ORIGIN = 'http://localhost:5173'
const LIST = '/api/admin/orders'
// From src/data/demoData.ts.
const NEW_DELIVERY = 'GPEC-O-2026-DE000001'
const PICKUP_PROCESSING = 'GPEC-O-2026-DE000002'
const UNREPORTED_TRANSFER = 'GPEC-O-2026-DE00000C'
const REPLY_TO = 'gpecengineeringcompanylimited@gmail.com'

let mailer: RecordingMailer
let agent: Awaited<ReturnType<typeof loggedInAgent>>
async function setUp(emailOn = true) {
  mailer = new RecordingMailer()
  const app = emailOn ? testApp({ email: TEST_EMAIL_SETTINGS }, mailer, noBreaches) : testApp()
  await createTestAdmin()
  await seedDemoData()
  agent = await loggedInAgent(app)
}

const setStatus = (reference: string, body: object) => agent.patch(`${LIST}/${reference}`).set('Origin', ORIGIN).send(body)
const closeTransfer = (body?: object) => agent.post(`${LIST}/${UNREPORTED_TRANSFER}/transfer-not-received`).set('Origin', ORIGIN).send(body)
const customerOf = async (reference: string) => (await Order.findOne({ reference }).lean())?.customer?.email ?? ''
// Emails go out after the response; give them a moment, then see what was sent.
async function sent() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return mailer.sent
}

describe('telling the customer about an order status change', () => {
  beforeEach(() => setUp())

  it('emails that a pickup order is ready, from GPEC with replies to GPEC, and records it', async () => {
    const res = await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'ready_for_pickup', notifyCustomer: true })
    expect(res.status).toBe(200)
    expect(res.body.emailOn).toBe(true)
    expect(res.body.history[0]).toMatchObject({ action: 'order.status', customerEmailed: true, changes: [{ field: 'fulfilmentStatus', from: 'processing', to: 'ready_for_pickup' }] })
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    const [email] = mailer.sent
    expect(email).toMatchObject({ to: [await customerOf(PICKUP_PROCESSING)], replyTo: REPLY_TO, subject: `Your GPEC order ${PICKUP_PROCESSING} is ready for pickup` })
    expect(email.text).toContain('is ready to collect from GPEC at #19 King Slope Street, Woji')
    expect(email.text).toContain('2 × Main isolator switch (GPEC-MIS-062)')
  })

  it('emails that a delivery order is on its way, naming the area', async () => {
    await setStatus(NEW_DELIVERY, { fulfilmentStatus: 'out_for_delivery', notifyCustomer: true })
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    expect(mailer.sent[0].subject).toBe(`Your GPEC order ${NEW_DELIVERY} is on its way`)
    expect(mailer.sent[0].text).toMatch(/is out for delivery to the address you gave \(Lagos\)\./)
  })

  it('emails a cancellation, pointing to the refunds policy without promising anything else', async () => {
    await setStatus(NEW_DELIVERY, { fulfilmentStatus: 'cancelled', notifyCustomer: true })
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    expect(mailer.sent[0].subject).toBe(`Your GPEC order ${NEW_DELIVERY} has been cancelled`)
    expect(mailer.sent[0].text).toContain('GPEC will contact you about your refund, as set out in the refunds policy: https://www.example.com/#refunds')
  })

  it.each([
    ['unticked', { notifyCustomer: false }],
    ['left out', {}],
  ])('sends nothing when the box is %s, and records that no email went', async (_label, extra) => {
    const res = await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'ready_for_pickup', ...extra })
    expect(res.body.history[0].customerEmailed).toBe(false)
    expect(await sent()).toEqual([])
  })

  it('emails only about ready, out for delivery, and cancelled', async () => {
    // Completed last: it is final.
    for (const fulfilmentStatus of ['processing', 'new', 'completed']) {
      const res = await setStatus(NEW_DELIVERY, { fulfilmentStatus, notifyCustomer: true })
      expect(res.body.history[0].customerEmailed).toBe(false)
    }
    expect(await sent()).toEqual([])
  })

  it('sends nothing when the status does not actually change, or the change is refused', async () => {
    expect((await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'out_for_delivery', notifyCustomer: true })).status).toBe(400)
    expect(await sent()).toEqual([])
    // Saving "ready for pickup" again (a second click) does not email the customer a second time.
    await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'ready_for_pickup', notifyCustomer: true })
    await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'ready_for_pickup', notifyCustomer: true })
    expect(await sent()).toHaveLength(1)
    // A completed order cannot be cancelled, so the customer is not told it was.
    await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'completed' })
    expect((await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'cancelled', notifyCustomer: true })).status).toBe(409)
    expect(await sent()).toHaveLength(1)
  })

  it.each([['yes'], [1], [{ $ne: false }]])('refuses notifyCustomer %j, changing nothing', async (notifyCustomer) => {
    const res = await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'ready_for_pickup', notifyCustomer })
    expect(res.status).toBe(400)
    expect(res.body.errors.notifyCustomer).toBe('notifyCustomer must be true or false.')
    expect((await Order.findOne({ reference: PICKUP_PROCESSING }).lean())?.fulfilmentStatus).toBe('processing')
    expect(await sent()).toEqual([])
  })
})

describe('telling the customer an unpaid transfer order was closed', () => {
  beforeEach(() => setUp())

  it('emails them, asking for details if they did send the money, and records it', async () => {
    const res = await closeTransfer({ notifyCustomer: true })
    expect(res.status).toBe(200)
    expect(res.body.history[0]).toMatchObject({ action: 'order.payment', customerEmailed: true })
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    expect(mailer.sent[0]).toMatchObject({ to: [await customerOf(UNREPORTED_TRANSFER)], replyTo: REPLY_TO, subject: `Your GPEC order ${UNREPORTED_TRANSFER} has been closed` })
    expect(mailer.sent[0].text).toContain('If you have sent the money, reply to this email with the date, the amount, and the bank you sent it from')
  })

  it('sends nothing when the box is unticked', async () => {
    expect((await closeTransfer({ notifyCustomer: false })).body.history[0].customerEmailed).toBe(false)
    expect(await sent()).toEqual([])
  })

  it('accepts no other details, for either transfer action', async () => {
    expect((await closeTransfer({ notifyCustomer: true, paymentStatus: 'paid' })).status).toBe(400)
    expect((await agent.post(`${LIST}/${UNREPORTED_TRANSFER}/transfer-received`).set('Origin', ORIGIN).send({ password: TEST_ADMIN.password, notifyCustomer: true })).status).toBe(400)
    expect((await Order.findOne({ reference: UNREPORTED_TRANSFER }).lean())?.paymentStatus).toBe('pending_payment')
    expect(await sent()).toEqual([])
  })

  it('still closes an order sent with no body, as before, without emailing', async () => {
    expect((await closeTransfer()).body.order.paymentStatus).toBe('failed')
    expect(await sent()).toEqual([])
  })
})

describe('with email switched off', () => {
  beforeEach(() => setUp(false))

  it('says so, sends nothing, and does not record an email', async () => {
    const res = await setStatus(PICKUP_PROCESSING, { fulfilmentStatus: 'ready_for_pickup', notifyCustomer: true })
    expect(res.body.emailOn).toBe(false)
    expect(res.body.history[0].customerEmailed).toBe(false)
    expect((await closeTransfer({ notifyCustomer: true })).body.history[0].customerEmailed).toBe(false)
    expect(await AuditRecord.countDocuments({ customerEmailed: true })).toBe(0)
  })
})
