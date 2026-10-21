import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import ContactRequest from '../src/models/ContactRequest.js'
import Enquiry from '../src/models/Enquiry.js'
import { seedSampleProducts } from '../src/services/products.js'
import { TEST_ADMIN, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()
const ORIGIN = 'http://localhost:5173'

const customer = { fullName: 'Ada Buyer', company: 'Acme Ltd', email: 'ada@example.com', phone: '0800 000 0000' }

async function submitEnquiry(fullName = customer.fullName) {
  const res = await request(app).post('/api/enquiries').send({ customer: { ...customer, fullName }, location: 'Lagos', notes: 'Needed this month.', items: [{ productId: 'panel-001', quantity: 2 }] })
  return res.body.reference as string
}

async function submitContactRequest(fullName = customer.fullName) {
  const res = await request(app).post('/api/contact-requests').send({ ...customer, fullName, subject: 'Solar energy', message: 'Please call me about a solar system for my shop.' })
  return res.body.reference as string
}

let agent: TestAgent
beforeEach(async () => {
  await seedSampleProducts()
  await createTestAdmin()
  agent = await loggedInAgent(app)
})

describe('anonymous visitors see nothing', () => {
  it.each([
    ['get', '/api/admin/enquiries'],
    ['get', '/api/admin/enquiries/GPEC-2026-00000000'],
    ['patch', '/api/admin/enquiries/GPEC-2026-00000000'],
    ['get', '/api/admin/contact-requests'],
    ['get', '/api/admin/contact-requests/GPEC-C-2026-00000000'],
    ['patch', '/api/admin/contact-requests/GPEC-C-2026-00000000'],
  ] as const)('%s %s is 401 with no customer data', async (method, path) => {
    await submitEnquiry()
    await submitContactRequest()
    const res = await request(app)[method](path).send({ status: 'closed' })
    expect(res.status).toBe(401)
    expect(JSON.stringify(res.body)).not.toContain('ada@example.com')
  })
})

describe('enquiry list and detail', () => {
  it('lists newest first with a summary, status counts, and no-store caching', async () => {
    const older = await submitEnquiry('Older Customer')
    const newer = await submitEnquiry('Newer Customer')
    await Enquiry.updateOne({ reference: older }, { status: 'closed' })
    const res = await agent.get('/api/admin/enquiries')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toMatchObject({ page: 1, totalPages: 1, total: 2, counts: { new: 1, in_progress: 0, closed: 1 } })
    expect(res.body.items.map((item: { reference: string }) => item.reference)).toEqual([newer, older])
    expect(res.body.items[0]).toMatchObject({ status: 'new', name: 'Newer Customer', company: 'Acme Ltd', email: 'ada@example.com', summary: '2 × Custom control panel' })
  })

  it('filters by status and pages 25 at a time', async () => {
    const now = Date.now()
    await Enquiry.insertMany(Array.from({ length: 27 }, (_, index) => ({
      reference: `GPEC-2026-${String(index).padStart(8, '0')}`,
      customer,
      items: [{ productId: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', quantity: 1 }],
      status: index < 3 ? 'in_progress' : 'new',
      createdAt: new Date(now - index * 1000),
    })))
    const page2 = await agent.get('/api/admin/enquiries?page=2')
    expect(page2.body).toMatchObject({ page: 2, totalPages: 2, total: 27 })
    expect(page2.body.items).toHaveLength(2)
    const inProgress = await agent.get('/api/admin/enquiries?status=in_progress')
    expect(inProgress.body.total).toBe(3)
    expect(inProgress.body.counts).toEqual({ new: 24, in_progress: 3, closed: 0 })
  })

  it.each(['status=bogus', 'page=0', 'page=abc'])('rejects ?%s', async (query) => {
    expect((await agent.get(`/api/admin/enquiries?${query}`)).status).toBe(400)
  })

  it('shows everything the customer sent', async () => {
    const reference = await submitEnquiry()
    const res = await agent.get(`/api/admin/enquiries/${reference}`)
    expect(res.status).toBe(200)
    expect(res.body.item).toMatchObject({
      reference,
      status: 'new',
      customer,
      location: 'Lagos',
      notes: 'Needed this month.',
      items: [{ productId: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', quantity: 2 }],
    })
    expect(res.body.history).toEqual([])
  })

  it('returns 404 for an unknown, malformed, or wrong-kind reference', async () => {
    const contactReference = await submitContactRequest()
    expect((await agent.get('/api/admin/enquiries/GPEC-2026-FFFFFFFF')).status).toBe(404)
    expect((await agent.get('/api/admin/enquiries/not-a-reference')).status).toBe(404)
    expect((await agent.get(`/api/admin/enquiries/${contactReference}`)).status).toBe(404)
  })
})

describe('contact request list and detail', () => {
  it('lists and shows contact requests with the message', async () => {
    const reference = await submitContactRequest()
    const list = await agent.get('/api/admin/contact-requests')
    expect(list.body.items[0]).toMatchObject({ reference, name: 'Ada Buyer', summary: 'Solar energy: Please call me about a solar system for my shop.' })
    const detail = await agent.get(`/api/admin/contact-requests/${reference}`)
    expect(detail.body.item).toMatchObject({ reference, customer, subject: 'Solar energy', message: 'Please call me about a solar system for my shop.' })
  })
})

describe('changing a request status', () => {
  function setStatus(path: string, body: object, origin = ORIGIN) {
    return agent.patch(path).set('Origin', origin).send(body)
  }

  it('changes the status and records who, from, to, and when', async () => {
    const reference = await submitEnquiry()
    const res = await setStatus(`/api/admin/enquiries/${reference}`, { status: 'in_progress' })
    expect(res.status).toBe(200)
    expect(res.body.item.status).toBe('in_progress')
    expect(res.body.history).toHaveLength(1)
    expect(res.body.history[0]).toMatchObject({ actor: { name: TEST_ADMIN.name, email: TEST_ADMIN.email }, changes: [{ field: 'status', from: 'new', to: 'in_progress' }] })
    expect(await AuditRecord.findOne({ targetId: reference }).lean()).toMatchObject({ action: 'enquiry.status', targetType: 'enquiry' })
  })

  it('can reopen a closed request, and records nothing when the status is unchanged', async () => {
    const reference = await submitContactRequest()
    const path = `/api/admin/contact-requests/${reference}`
    await setStatus(path, { status: 'closed' })
    await setStatus(path, { status: 'closed' })
    const reopened = await setStatus(path, { status: 'new' })
    expect(reopened.body.item.status).toBe('new')
    expect(reopened.body.history.map((entry: { changes: { to: string }[] }) => entry.changes[0].to)).toEqual(['new', 'closed'])
    expect(await AuditRecord.findOne({ targetId: reference }).lean()).toMatchObject({ action: 'contactRequest.status' })
  })

  it('accepts only a known status, and never edits customer details', async () => {
    const reference = await submitEnquiry()
    const path = `/api/admin/enquiries/${reference}`
    expect((await setStatus(path, { status: 'deleted' })).status).toBe(400)
    expect((await setStatus(path, { status: { $ne: '' } })).status).toBe(400)
    const res = await setStatus(path, { status: 'closed', customer: { email: 'changed@example.com' } })
    expect(res.status).toBe(400)
    expect(res.body.errors.customer).toBe('customer cannot be changed.')
    expect(await Enquiry.findOne({ reference }).lean()).toMatchObject({ status: 'new', customer: { email: 'ada@example.com' } })
  })

  it('refuses a change sent from another site', async () => {
    const reference = await submitEnquiry()
    expect((await setStatus(`/api/admin/enquiries/${reference}`, { status: 'closed' }, 'https://attacker.example')).status).toBe(403)
    expect((await Enquiry.findOne({ reference }).lean())?.status).toBe('new')
  })

  it('does not change the status if its history record cannot be saved', async () => {
    const reference = await submitEnquiry()
    const spy = vi.spyOn(AuditRecord, 'create').mockRejectedValueOnce(new Error('audit write failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await setStatus(`/api/admin/enquiries/${reference}`, { status: 'closed' })
    spy.mockRestore()
    consoleSpy.mockRestore()
    expect(res.status).toBe(500)
    expect((await Enquiry.findOne({ reference }).lean())?.status).toBe('new')
  })

  it('still makes every new request "new", whatever the customer sends', async () => {
    const res = await request(app).post('/api/contact-requests').send({ ...customer, message: 'Hello there', status: 'closed' })
    expect((await ContactRequest.findOne({ reference: res.body.reference }).lean())?.status).toBe('new')
  })
})
