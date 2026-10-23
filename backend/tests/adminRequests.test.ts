import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import ContactRequest from '../src/models/ContactRequest.js'
import { TEST_ADMIN, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()
const ORIGIN = 'http://localhost:5173'
const LIST = '/api/admin/contact-requests'

const customer = { fullName: 'Ada Buyer', company: 'Acme Ltd', email: 'ada@example.com', phone: '0800 000 0000' }
const MESSAGE = 'Please call me about a solar system for my shop.'

async function submitContactRequest(fields: Partial<typeof customer> = {}) {
  const res = await request(app).post('/api/contact-requests').send({ ...customer, ...fields, subject: 'Solar energy', message: MESSAGE })
  return res.body.reference as string
}

let agent: TestAgent
beforeEach(async () => {
  await createTestAdmin()
  agent = await loggedInAgent(app)
})

describe('anonymous visitors see nothing', () => {
  it.each([
    ['get', LIST],
    ['get', `${LIST}/GPEC-C-2026-00000000`],
    ['patch', `${LIST}/GPEC-C-2026-00000000`],
  ] as const)('%s %s is 401 with no customer data', async (method, path) => {
    await submitContactRequest()
    const res = await request(app)[method](path).send({ status: 'closed' })
    expect(res.status).toBe(401)
    expect(JSON.stringify(res.body)).not.toContain('ada@example.com')
  })
})

describe('contact request list and detail', () => {
  it('lists newest first with a summary, status counts, and no-store caching', async () => {
    const older = await submitContactRequest({ fullName: 'Older Customer' })
    const newer = await submitContactRequest({ fullName: 'Newer Customer' })
    await ContactRequest.updateOne({ reference: older }, { status: 'closed' })
    const res = await agent.get(LIST)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toMatchObject({ page: 1, totalPages: 1, total: 2, counts: { new: 1, in_progress: 0, closed: 1 } })
    expect(res.body.items.map((item: { reference: string }) => item.reference)).toEqual([newer, older])
    expect(res.body.items[0]).toMatchObject({ status: 'new', name: 'Newer Customer', company: 'Acme Ltd', email: 'ada@example.com', summary: `Solar energy: ${MESSAGE}` })
  })

  it('filters by status and pages 10 at a time', async () => {
    const now = Date.now()
    await ContactRequest.insertMany(Array.from({ length: 27 }, (_, index) => ({
      reference: `GPEC-C-2026-${String(index).padStart(8, '0')}`,
      ...customer,
      message: 'Hello',
      status: index < 3 ? 'in_progress' : 'new',
      createdAt: new Date(now - index * 1000),
    })))
    const page3 = await agent.get(`${LIST}?page=3`)
    expect(page3.body).toMatchObject({ page: 3, pageSize: 10, totalPages: 3, total: 27 })
    expect(page3.body.items).toHaveLength(7)
    const inProgress = await agent.get(`${LIST}?status=in_progress`)
    expect(inProgress.body.total).toBe(3)
    expect(inProgress.body.counts).toEqual({ new: 24, in_progress: 3, closed: 0 })
  })

  it.each(['status=bogus', 'page=0', 'page=abc'])('rejects ?%s', async (query) => {
    expect((await agent.get(`${LIST}?${query}`)).status).toBe(400)
  })

  it('shows everything the customer sent', async () => {
    const reference = await submitContactRequest()
    const res = await agent.get(`${LIST}/${reference}`)
    expect(res.status).toBe(200)
    expect(res.body.item).toMatchObject({ reference, status: 'new', customer, subject: 'Solar energy', message: MESSAGE })
    expect(res.body.history).toEqual([])
  })

  it('returns 404 for an unknown or malformed reference', async () => {
    expect((await agent.get(`${LIST}/GPEC-C-2026-FFFFFFFF`)).status).toBe(404)
    expect((await agent.get(`${LIST}/not-a-reference`)).status).toBe(404)
    expect((await agent.get(`${LIST}/GPEC-2026-FFFFFFFF`)).status).toBe(404)
  })
})

describe('searching requests', () => {
  async function search(query: Record<string, string>) {
    const res = await agent.get(LIST).query(query)
    expect(res.status).toBe(200)
    return res.body
  }

  it('matches name, company, email, and reference, ignoring case, with counts for the matches', async () => {
    const ada = await submitContactRequest()
    const bola = await submitContactRequest({ fullName: 'Bola Okoro', company: 'Sunrise Farms', email: 'bola@farm.example' })
    await ContactRequest.updateOne({ reference: bola }, { status: 'closed' })
    for (const q of ['okoro', 'SUNRISE', 'bola@farm', bola.slice(-8).toLowerCase()]) {
      const body = await search({ q })
      expect(body.items.map((item: { reference: string }) => item.reference)).toEqual([bola])
      expect(body.counts).toEqual({ new: 0, in_progress: 0, closed: 1 })
    }
    expect((await search({ q: 'acme', status: 'new' })).items[0].reference).toBe(ada)
    expect((await search({ q: 'acme', status: 'closed' })).total).toBe(0)
  })

  it('treats the search as plain text, never as a pattern or a query operator', async () => {
    await submitContactRequest()
    expect((await search({ q: '.*' })).total).toBe(0)
    expect((await search({ q: '(' })).total).toBe(0)
    // ?q[$ne]=x arrives as an object or a literal key, never as an operator; it matches everything
    // like an empty search rather than failing or filtering.
    expect((await agent.get(`${LIST}?q[$ne]=x`)).body.total).toBe(1)
    expect((await agent.get(`${LIST}?q=a&q=b`)).body.total).toBe(1)
  })

  it('rejects a search over 100 characters', async () => {
    expect((await agent.get(LIST).query({ q: 'x'.repeat(101) })).status).toBe(400)
  })
})

describe('internal notes', () => {
  function addNote(path: string, body: object, origin = ORIGIN) {
    return agent.post(`${path}/notes`).set('Origin', origin).send(body)
  }

  it('adds a note with who and when, newest first, without changing the request', async () => {
    const reference = await submitContactRequest()
    const path = `${LIST}/${reference}`
    const first = await addNote(path, { text: '  Called the customer; quote sent.  ' })
    expect(first.status).toBe(201)
    expect(first.body.notes).toEqual([{ author: { name: TEST_ADMIN.name, email: TEST_ADMIN.email }, text: 'Called the customer; quote sent.', createdAt: expect.any(String) }])
    await addNote(path, { text: 'Customer accepted.' })
    const detail = await agent.get(path)
    expect(detail.body.notes.map((note: { text: string }) => note.text)).toEqual(['Customer accepted.', 'Called the customer; quote sent.'])
    expect(detail.body.item.status).toBe('new')
    expect(detail.body.history).toEqual([])
  })

  it('keeps notes separate between requests', async () => {
    const first = await submitContactRequest()
    const second = await submitContactRequest()
    await addNote(`${LIST}/${second}`, { text: 'Second request note' })
    expect((await agent.get(`${LIST}/${first}`)).body.notes).toEqual([])
    expect((await agent.get(`${LIST}/${second}`)).body.notes).toHaveLength(1)
  })

  it.each([
    [{}, 'text', 'text is required.'],
    [{ text: '   ' }, 'text', 'text is required.'],
    [{ text: { $ne: '' } }, 'text', 'text is required.'],
    [{ text: 'x'.repeat(2001) }, 'text', 'text must be 2000 characters or fewer.'],
    [{ text: 'Fine', author: 'Someone else' }, 'author', 'author is not allowed.'],
  ])('rejects %j', async (body, field, message) => {
    const reference = await submitContactRequest()
    const res = await addNote(`${LIST}/${reference}`, body)
    expect(res.status).toBe(400)
    expect(res.body.errors[field]).toBe(message)
    expect((await agent.get(`${LIST}/${reference}`)).body.notes).toEqual([])
  })

  it('returns 404 for an unknown reference and saves nothing', async () => {
    expect((await addNote(`${LIST}/GPEC-C-2026-FFFFFFFF`, { text: 'Note' })).status).toBe(404)
  })

  it('refuses anonymous visitors and other sites', async () => {
    const reference = await submitContactRequest()
    const path = `${LIST}/${reference}`
    expect((await request(app).post(`${path}/notes`).set('Origin', ORIGIN).send({ text: 'Note' })).status).toBe(401)
    expect((await addNote(path, { text: 'Note' }, 'https://attacker.example')).status).toBe(403)
    expect((await agent.get(path)).body.notes).toEqual([])
  })
})

describe('changing a request status', () => {
  function setStatus(path: string, body: object, origin = ORIGIN) {
    return agent.patch(path).set('Origin', origin).send(body)
  }

  it('changes the status and records who, from, to, and when', async () => {
    const reference = await submitContactRequest()
    const res = await setStatus(`${LIST}/${reference}`, { status: 'in_progress' })
    expect(res.status).toBe(200)
    expect(res.body.item.status).toBe('in_progress')
    expect(res.body.history).toHaveLength(1)
    expect(res.body.history[0]).toMatchObject({ actor: { name: TEST_ADMIN.name, email: TEST_ADMIN.email }, changes: [{ field: 'status', from: 'new', to: 'in_progress' }] })
    expect(await AuditRecord.findOne({ targetId: reference }).lean()).toMatchObject({ action: 'contactRequest.status', targetType: 'contactRequest' })
  })

  it('can reopen a closed request, and records nothing when the status is unchanged', async () => {
    const reference = await submitContactRequest()
    const path = `${LIST}/${reference}`
    await setStatus(path, { status: 'closed' })
    await setStatus(path, { status: 'closed' })
    const reopened = await setStatus(path, { status: 'new' })
    expect(reopened.body.item.status).toBe('new')
    expect(reopened.body.history.map((entry: { changes: { to: string }[] }) => entry.changes[0].to)).toEqual(['new', 'closed'])
  })

  it('accepts only a known status, and never edits customer details', async () => {
    const reference = await submitContactRequest()
    const path = `${LIST}/${reference}`
    expect((await setStatus(path, { status: 'deleted' })).status).toBe(400)
    expect((await setStatus(path, { status: { $ne: '' } })).status).toBe(400)
    const res = await setStatus(path, { status: 'closed', email: 'changed@example.com' })
    expect(res.status).toBe(400)
    expect(res.body.errors.email).toBe('email cannot be changed.')
    expect(await ContactRequest.findOne({ reference }).lean()).toMatchObject({ status: 'new', email: 'ada@example.com' })
  })

  it('refuses a change sent from another site', async () => {
    const reference = await submitContactRequest()
    expect((await setStatus(`${LIST}/${reference}`, { status: 'closed' }, 'https://attacker.example')).status).toBe(403)
    expect((await ContactRequest.findOne({ reference }).lean())?.status).toBe('new')
  })

  it('does not change the status if its history record cannot be saved', async () => {
    const reference = await submitContactRequest()
    const spy = vi.spyOn(AuditRecord, 'create').mockRejectedValueOnce(new Error('audit write failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await setStatus(`${LIST}/${reference}`, { status: 'closed' })
    spy.mockRestore()
    consoleSpy.mockRestore()
    expect(res.status).toBe(500)
    expect((await ContactRequest.findOne({ reference }).lean())?.status).toBe('new')
  })

  it('still makes every new request "new", whatever the customer sends', async () => {
    const res = await request(app).post('/api/contact-requests').send({ ...customer, message: 'Hello there', status: 'closed' })
    expect((await ContactRequest.findOne({ reference: res.body.reference }).lean())?.status).toBe('new')
  })
})
