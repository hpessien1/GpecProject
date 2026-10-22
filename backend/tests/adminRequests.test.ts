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

describe('searching requests', () => {
  async function searchReferences(path: string, query: Record<string, string>) {
    const res = await agent.get(path).query(query)
    expect(res.status).toBe(200)
    return res.body
  }

  it('matches name, company, email, and reference, ignoring case, with counts for the matches', async () => {
    const ada = await submitEnquiry()
    const bola = (await request(app).post('/api/enquiries').send({ customer: { fullName: 'Bola Okoro', company: 'Sunrise Farms', email: 'bola@farm.example', phone: '0800' }, items: [{ productId: 'panel-001', quantity: 1 }] })).body.reference as string
    await Enquiry.updateOne({ reference: bola }, { status: 'closed' })
    for (const q of ['okoro', 'SUNRISE', 'bola@farm', bola.slice(-8).toLowerCase()]) {
      const body = await searchReferences('/api/admin/enquiries', { q })
      expect(body.items.map((item: { reference: string }) => item.reference)).toEqual([bola])
      expect(body.counts).toEqual({ new: 0, in_progress: 0, closed: 1 })
    }
    expect((await searchReferences('/api/admin/enquiries', { q: 'acme', status: 'new' })).items[0].reference).toBe(ada)
    expect((await searchReferences('/api/admin/enquiries', { q: 'acme', status: 'closed' })).total).toBe(0)
  })

  it('searches contact requests by their own fields', async () => {
    const reference = await submitContactRequest('Chidi Eze')
    await submitContactRequest()
    const body = await searchReferences('/api/admin/contact-requests', { q: 'chidi' })
    expect(body.items.map((item: { reference: string }) => item.reference)).toEqual([reference])
  })

  it('treats the search as plain text, never as a pattern or a query operator', async () => {
    await submitEnquiry()
    expect((await searchReferences('/api/admin/enquiries', { q: '.*' })).total).toBe(0)
    expect((await searchReferences('/api/admin/enquiries', { q: '(' })).total).toBe(0)
    // ?q[$ne]=x arrives as an object or a literal key, never as an operator; it matches everything
    // like an empty search rather than failing or filtering.
    expect((await agent.get('/api/admin/enquiries?q[$ne]=x')).body.total).toBe(1)
    expect((await agent.get('/api/admin/enquiries?q=a&q=b')).body.total).toBe(1)
  })

  it('rejects a search over 100 characters', async () => {
    expect((await agent.get('/api/admin/enquiries').query({ q: 'x'.repeat(101) })).status).toBe(400)
  })
})

describe('internal notes', () => {
  function addNote(path: string, body: object, origin = ORIGIN) {
    return agent.post(`${path}/notes`).set('Origin', origin).send(body)
  }

  it('adds a note with who and when, newest first, without changing the request', async () => {
    const reference = await submitEnquiry()
    const path = `/api/admin/enquiries/${reference}`
    const first = await addNote(path, { text: '  Called the customer; quote sent.  ' })
    expect(first.status).toBe(201)
    expect(first.body.notes).toEqual([{ author: { name: TEST_ADMIN.name, email: TEST_ADMIN.email }, text: 'Called the customer; quote sent.', createdAt: expect.any(String) }])
    await addNote(path, { text: 'Customer accepted.' })
    const detail = await agent.get(path)
    expect(detail.body.notes.map((note: { text: string }) => note.text)).toEqual(['Customer accepted.', 'Called the customer; quote sent.'])
    expect(detail.body.item.status).toBe('new')
    expect(detail.body.history).toEqual([])
  })

  it('keeps notes separate between requests and kinds', async () => {
    const enquiry = await submitEnquiry()
    const contact = await submitContactRequest()
    await addNote(`/api/admin/contact-requests/${contact}`, { text: 'Contact note' })
    expect((await agent.get(`/api/admin/enquiries/${enquiry}`)).body.notes).toEqual([])
    expect((await agent.get(`/api/admin/contact-requests/${contact}`)).body.notes).toHaveLength(1)
  })

  it.each([
    [{}, 'text', 'text is required.'],
    [{ text: '   ' }, 'text', 'text is required.'],
    [{ text: { $ne: '' } }, 'text', 'text is required.'],
    [{ text: 'x'.repeat(2001) }, 'text', 'text must be 2000 characters or fewer.'],
    [{ text: 'Fine', author: 'Someone else' }, 'author', 'author is not allowed.'],
  ])('rejects %j', async (body, field, message) => {
    const reference = await submitEnquiry()
    const res = await addNote(`/api/admin/enquiries/${reference}`, body)
    expect(res.status).toBe(400)
    expect(res.body.errors[field]).toBe(message)
    expect((await agent.get(`/api/admin/enquiries/${reference}`)).body.notes).toEqual([])
  })

  it('returns 404 for an unknown or wrong-kind reference and saves nothing', async () => {
    const contact = await submitContactRequest()
    expect((await addNote('/api/admin/enquiries/GPEC-2026-FFFFFFFF', { text: 'Note' })).status).toBe(404)
    expect((await addNote(`/api/admin/enquiries/${contact}`, { text: 'Note' })).status).toBe(404)
    expect((await agent.get(`/api/admin/contact-requests/${contact}`)).body.notes).toEqual([])
  })

  it('refuses anonymous visitors and other sites', async () => {
    const reference = await submitEnquiry()
    const path = `/api/admin/enquiries/${reference}/notes`
    expect((await request(app).post(path).set('Origin', ORIGIN).send({ text: 'Note' })).status).toBe(401)
    expect((await addNote(`/api/admin/enquiries/${reference}`, { text: 'Note' }, 'https://attacker.example')).status).toBe(403)
    expect((await agent.get(`/api/admin/enquiries/${reference}`)).body.notes).toEqual([])
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
