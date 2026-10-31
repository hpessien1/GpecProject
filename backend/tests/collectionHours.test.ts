import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import CollectionSettings from '../src/models/CollectionSettings.js'
import { customerOrderEmail, customerOrderUpdateEmail } from '../src/services/emailTemplates.js'
import type { OrderEmailData } from '../src/services/emailTemplates.js'
import { createNotifier } from '../src/services/notifications.js'
import { RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, createTestAdmin, loggedInAgent, noBreaches, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const ORIGIN = 'http://localhost:5173'
const SETTINGS = '/api/admin/collection-hours'

let app: ReturnType<typeof testApp>
let agent: Awaited<ReturnType<typeof loggedInAgent>>
beforeEach(async () => {
  app = testApp({}, undefined, noBreaches)
  await createTestAdmin()
  agent = await loggedInAgent(app)
})

const change = (body: object, origin = ORIGIN) => agent.patch(SETTINGS).set('Origin', origin).send(body)

const order = {
  _id: 'a'.repeat(24), reference: 'GPEC-O-2026-A0000001', customer: { fullName: 'Ada', company: '', email: 'ada@example.org', phone: '' },
  items: [{ productId: 'solar-001', name: 'Solar kit', reference: 'GPEC-SOL-020', unitPrice: 100_000, quantity: 1, lineTotal: 100_000 }],
  fulfilmentMethod: 'pickup', deliveryAddress: '', deliveryArea: null, customerNotes: '', currency: 'NGN', subtotal: 100_000, deliveryFee: 0, paystackFee: 0, total: 100_000,
} as unknown as OrderEmailData

describe('collection hours (admin)', () => {
  it('is for logged-in admins only, and refuses other sites', async () => {
    expect((await request(app).get(SETTINGS)).status).toBe(401)
    expect((await request(app).patch(SETTINGS).send({ hours: '8am to 4pm' })).status).toBe(401)
    expect((await change({ hours: '8am to 4pm' }, 'https://evil.example')).status).toBe(403)
    expect(await CollectionSettings.countDocuments()).toBe(0)
  })

  it('starts as the hours GPEC gave, with no history', async () => {
    expect((await agent.get(SETTINGS)).body).toEqual({ hours: '9am to 5pm', history: [], historyCursor: null })
  })

  it('saves new hours and records who changed them, from what, to what', async () => {
    const res = await change({ hours: '  8am to 4pm, Monday to Friday ' })
    expect(res.status).toBe(200)
    expect(res.body.hours).toBe('8am to 4pm, Monday to Friday')
    expect(res.body.history).toEqual([expect.objectContaining({ action: 'collection.update', actor: { name: TEST_ADMIN.name, email: TEST_ADMIN.email }, changes: [{ field: 'hours', from: '9am to 5pm', to: '8am to 4pm, Monday to Friday' }] })])
    expect((await request(app).get('/api/checkout')).body.collectionHours).toBe('8am to 4pm, Monday to Friday')
  })

  it('records nothing when the hours do not change', async () => {
    expect((await change({ hours: '9am to 5pm' })).status).toBe(200)
    expect(await AuditRecord.countDocuments()).toBe(0)
    expect(await CollectionSettings.countDocuments()).toBe(0)
  })

  it('refuses empty, too long, several lines, non-text, and other fields', async () => {
    for (const body of [{ hours: '' }, {}, { hours: 'x'.repeat(121) }, { hours: '9am\nClick https://evil.example' }, { hours: { $gt: '' } }, { hours: '9am', replyTo: 'x@example.com' }]) {
      expect((await change(body)).status).toBe(400)
    }
    expect(await CollectionSettings.countDocuments()).toBe(0)
  })
})

describe('collection hours (customers)', () => {
  it('are public at checkout', async () => {
    expect((await request(app).get('/api/checkout')).body.collectionHours).toBe('9am to 5pm')
  })

  it('appear in the pickup confirmation and ready-for-pickup emails, as staff saved them', async () => {
    expect(customerOrderEmail(order, 'https://example.test', '8am to 4pm').text).toContain('Collection hours: 8am to 4pm.')
    expect(customerOrderUpdateEmail(order, 'ready_for_pickup', 'https://example.test', '8am to 4pm').text).toContain('Collection hours: 8am to 4pm.')
  })

  it('are left out of delivery emails', () => {
    expect(customerOrderEmail({ ...order, fulfilmentMethod: 'delivery' }, 'https://example.test', '8am to 4pm').text).not.toContain('Collection hours')
  })

  it('fall back to GPEC’s stated hours if the saved ones cannot be read: the email still goes', async () => {
    const mailer = new RecordingMailer()
    const notifier = createNotifier(mailer, TEST_EMAIL_SETTINGS, async () => 'reply@example.com', async () => { throw new Error('database down') })
    await notifier.orderUpdate(order, 'ready_for_pickup')
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0].text).toContain('Collection hours: 9am to 5pm.')
  })
})
