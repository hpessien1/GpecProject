import { readFileSync } from 'node:fs'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import ContactRequest from '../src/models/ContactRequest.js'
import { contactSubjects } from '../src/validation/contactRequest.js'
import { testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()

function validRequest() {
  return {
    fullName: 'Ada Buyer',
    company: 'Acme Ltd',
    email: 'Ada@Example.com',
    phone: '0800 000 0000',
    subject: 'Solar energy',
    message: 'We need a solar system for a small office.',
  }
}

describe('POST /api/contact-requests', () => {
  it('saves a valid request with a GPEC-C reference', async () => {
    const res = await request(app).post('/api/contact-requests').send(validRequest())
    expect(res.status).toBe(201)
    expect(res.body.reference).toMatch(/^GPEC-C-\d{4}-[0-9A-F]{8}$/)

    const saved = await ContactRequest.findOne({ reference: res.body.reference }).lean()
    expect(saved).toMatchObject({ fullName: 'Ada Buyer', email: 'ada@example.com', subject: 'Solar energy', status: 'new' })
  })

  it('accepts a request without the optional fields', async () => {
    const res = await request(app).post('/api/contact-requests').send({ fullName: 'Ada', email: 'ada@example.com', message: 'Hello' })
    expect(res.status).toBe(201)
    const saved = await ContactRequest.findOne({ reference: res.body.reference }).lean()
    expect(saved).toMatchObject({ company: '', phone: '', subject: '' })
  })

  it('reports every missing required field', async () => {
    const res = await request(app).post('/api/contact-requests').send({})
    expect(res.status).toBe(400)
    expect(res.body.errors).toEqual({ fullName: 'fullName is required.', email: 'email is required.', message: 'message is required.' })
  })

  it('rejects a subject that is not one of the listed options', async () => {
    const res = await request(app).post('/api/contact-requests').send({ ...validRequest(), subject: 'Free money' })
    expect(res.status).toBe(400)
    expect(res.body.errors.subject).toBe('subject must be one of the listed options.')
    expect(await ContactRequest.countDocuments()).toBe(0)
  })

  it('rejects an invalid email and an over-long message', async () => {
    const res = await request(app).post('/api/contact-requests').send({ ...validRequest(), email: 'nope', message: 'x'.repeat(5001) })
    expect(res.status).toBe(400)
    expect(res.body.errors).toMatchObject({ email: 'email must be valid.', message: 'message must be 5000 characters or fewer.' })
  })

  // Audit S4-L01: `?`, `&`, and `%` after the @ added recipients to staff's "email the customer" link.
  it.each([
    'customer@example.invalid?bcc=audit-copy%40example.invalid&x=',
    'customer@example.invalid&cc=other.invalid',
    'customer@example%2Einvalid',
    'customer@example.invalid#x',
    'customer@-example.invalid',
  ])('rejects an email whose domain is not a domain: %s', async (email) => {
    const res = await request(app).post('/api/contact-requests').send({ ...validRequest(), email })
    expect(res.status).toBe(400)
    expect(res.body.errors.email).toBe('email must be valid.')
    expect(await ContactRequest.countDocuments()).toBe(0)
  })

  it.each(['ada.obi+orders@mail.example.ng', "o'neil@example.com", 'ada_buyer@sub-domain.example.co.uk', 'ada@xn--80ak6aa92e.com'])('accepts an ordinary email: %s', async (email) => {
    expect((await request(app).post('/api/contact-requests').send({ ...validRequest(), email })).status).toBe(201)
  })

  it('ignores reference and status sent by the client', async () => {
    const res = await request(app).post('/api/contact-requests').send({ ...validRequest(), reference: 'MINE', status: 'closed' })
    expect(res.status).toBe(201)
    const saved = await ContactRequest.findOne({ reference: res.body.reference }).lean()
    expect(saved?.reference).not.toBe('MINE')
    expect(saved?.status).toBe('new')
  })
})

describe('spam trap on contact requests', () => {
  it('answers as if saved but stores nothing when the hidden field is filled in', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await request(app).post('/api/contact-requests').send({ ...validRequest(), website: 'buy now' })
    info.mockRestore()
    expect(res.status).toBe(201)
    expect(res.body.reference).toMatch(/^GPEC-C-\d{4}-[0-9A-F]{8}$/)
    expect(await ContactRequest.countDocuments()).toBe(0)
  })

  it('saves normally when the hidden field is empty', async () => {
    expect((await request(app).post('/api/contact-requests').send({ ...validRequest(), website: '' })).status).toBe(201)
    expect(await ContactRequest.countDocuments()).toBe(1)
  })
})

describe('contact form topics', () => {
  it.each(contactSubjects)('accepts the topic "%s"', async (subject) => {
    expect((await request(app).post('/api/contact-requests').send({ ...validRequest(), subject })).status).toBe(201)
  })

  it('refuses the old merged topic', async () => {
    const res = await request(app).post('/api/contact-requests').send({ ...validRequest(), subject: 'Electronics or industrial supply' })
    expect(res.status).toBe(400)
  })

  // The list is duplicated in the frontend's form; a mismatch would make the form send topics the
  // server refuses. This reads the frontend file so the two cannot drift apart.
  it('matches the topics offered by the website form, in the same order', () => {
    const source = readFileSync(new URL('../../frontend/src/data/landingContent.ts', import.meta.url), 'utf8')
    const list = /export const contactSubjects = \[([^\]]*)\]/.exec(source)?.[1] ?? ''
    expect([...list.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual(contactSubjects)
  })
})
