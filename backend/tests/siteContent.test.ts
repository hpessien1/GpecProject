import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_CONTENT_DEFAULTS } from '../src/data/siteContentDefaults.js'
import AuditRecord from '../src/models/AuditRecord.js'
import SiteContent from '../src/models/SiteContent.js'
import { TEST_ADMIN, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()

const ORIGIN = 'http://localhost:5173'
const ADMIN = '/api/admin/content'
const SECTIONS = [{ heading: 'Cancelling an order', body: 'You can cancel before collection.\n\n- Pickup: before collection' }]

let app: ReturnType<typeof testApp>
let agent: TestAgent

beforeEach(async () => {
  app = testApp()
  await createTestAdmin()
  agent = await loggedInAgent(app)
})

const save = (key: string, body: unknown) => agent.patch(`${ADMIN}/${key}`).set('Origin', ORIGIN).send(body as object)

describe('site content (public)', () => {
  it('serves each page\'s starting text as a draft until staff save it', async () => {
    for (const key of ['privacy', 'refunds', 'faq'] as const) {
      const res = await request(app).get(`/api/content/${key}`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ key, ...SITE_CONTENT_DEFAULTS[key], approved: false, updatedAt: '2026-10-24T00:00:00.000Z' })
    }
  })

  it('answers 404 for a page that does not exist', async () => {
    expect((await request(app).get('/api/content/terms')).status).toBe(404)
    expect((await request(app).get('/api/content/__proto__')).status).toBe(404)
  })

  it('serves what staff saved, as soon as it is saved', async () => {
    await save('refunds', { title: 'Returns', sections: SECTIONS, approved: true })
    const res = await request(app).get('/api/content/refunds')
    expect(res.body).toMatchObject({ key: 'refunds', title: 'Returns', intro: SITE_CONTENT_DEFAULTS.refunds.intro, sections: SECTIONS, approved: true })
    expect(Date.parse(res.body.updatedAt)).toBeGreaterThan(Date.parse('2026-10-24'))
  })
})

describe('site content (admin)', () => {
  it('is for admins only, and changes must come from the GPEC site', async () => {
    expect((await request(app).get(ADMIN)).status).toBe(401)
    expect((await request(app).get(`${ADMIN}/faq`)).status).toBe(401)
    expect((await request(app).patch(`${ADMIN}/faq`).send({ approved: true })).status).toBe(401)
    expect((await agent.patch(`${ADMIN}/faq`).set('Origin', 'https://evil.example').send({ approved: true })).status).toBe(403)
    expect(await SiteContent.countDocuments()).toBe(0)
  })

  it('lists the three pages with their status', async () => {
    await save('faq', { approved: true })
    const res = await agent.get(ADMIN)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body.pages.map(({ key, title, approved }: { key: string, title: string, approved: boolean }) => ({ key, title, approved }))).toEqual([
      { key: 'privacy', title: 'Privacy notice', approved: false },
      { key: 'refunds', title: 'Refunds, cancellations, and returns', approved: false },
      { key: 'faq', title: 'Frequently asked questions', approved: true },
    ])
  })

  it('saves a change and records who changed what, with the old and new text', async () => {
    const res = await save('refunds', { intro: 'New intro.', sections: SECTIONS })
    expect(res.status).toBe(200)
    expect(res.body.page).toMatchObject({ intro: 'New intro.', sections: SECTIONS, approved: false })
    expect(res.body.history).toHaveLength(1)
    expect(res.body.history[0]).toMatchObject({ action: 'siteContent.update', actor: { name: TEST_ADMIN.name, email: TEST_ADMIN.email } })
    expect(res.body.history[0].changes).toEqual([
      { field: 'intro', from: SITE_CONTENT_DEFAULTS.refunds.intro, to: 'New intro.' },
      { field: 'sections', from: SITE_CONTENT_DEFAULTS.refunds.sections, to: SECTIONS },
    ])

    // Saving the same text again changes and records nothing.
    await save('refunds', { intro: 'New intro.', sections: SECTIONS })
    expect(await AuditRecord.countDocuments({ targetType: 'siteContent' })).toBe(1)

    // The first save stored the whole page, including the parts not sent.
    expect(await SiteContent.findById('refunds').lean()).toMatchObject({ title: SITE_CONTENT_DEFAULTS.refunds.title, intro: 'New intro.', approved: false })
  })

  it('records approving and un-approving the wording', async () => {
    await save('privacy', { approved: true })
    await save('privacy', { approved: false })
    const res = await agent.get(`${ADMIN}/privacy`)
    expect(res.body.history.map((entry: { changes: unknown[] }) => entry.changes)).toEqual([[{ field: 'approved', from: true, to: false }], [{ field: 'approved', from: false, to: true }]])
  })

  it('keeps every change reachable, a page at a time', async () => {
    for (let round = 1; round <= 12; round++) await save('faq', { intro: `Intro ${round}` })
    const first = await agent.get(`${ADMIN}/faq`)
    expect(first.body.history).toHaveLength(10)
    const older = await agent.get(`${ADMIN}/faq/history`).query({ before: first.body.historyCursor })
    expect(older.body.history.map((entry: { changes: { to: string }[] }) => entry.changes[0].to)).toEqual(['Intro 2', 'Intro 1'])
    expect(older.body.historyCursor).toBeNull()
    expect((await agent.get(`${ADMIN}/faq/history`).query({ before: 'nonsense' })).status).toBe(400)
  })

  it('answers 404 for a page that does not exist', async () => {
    expect((await agent.get(`${ADMIN}/terms`)).status).toBe(404)
    expect((await save('terms', { approved: true })).status).toBe(404)
  })

  it('accepts a long page (a full policy is larger than other forms)', async () => {
    const sections = Array.from({ length: 14 }, (_, index) => ({ heading: `Question ${index + 1}`, body: 'x'.repeat(3_900) }))
    const res = await save('faq', { sections })
    expect(res.status).toBe(200)
    expect(res.body.page.sections).toHaveLength(14)
  })
})

describe('site content validation', () => {
  it.each([
    ['an unknown field', { status: 'live' }, 'status'],
    ['nothing to change', {}, 'body'],
    ['an empty title', { title: '  ' }, 'title'],
    ['a title that is not text', { title: 42 }, 'title'],
    ['an intro that is a query operator', { intro: { $gt: '' } }, 'intro'],
    ['approved that is not true or false', { approved: 'yes' }, 'approved'],
    ['sections that are not a list', { sections: 'Cancelling' }, 'sections'],
    ['a section that is not an object', { sections: ['Cancelling'] }, 'sections.0'],
    ['a section without a heading', { sections: [{ heading: '', body: 'Text' }] }, 'sections.0.heading'],
    ['a section without text', { sections: [{ heading: 'Heading', body: ' ' }] }, 'sections.0.body'],
    ['a section heading that is not text', { sections: [{ heading: ['a'], body: 'Text' }] }, 'sections.0.heading'],
    ['an extra section field', { sections: [{ heading: 'Heading', body: 'Text', html: '<script>' }] }, 'sections.0.html'],
    ['a section heading that is too long', { sections: [{ heading: 'x'.repeat(201), body: 'Text' }] }, 'sections.0.heading'],
    ['section text that is too long', { sections: [{ heading: 'Heading', body: 'x'.repeat(4_001) }] }, 'sections.0.body'],
    ['too many sections', { sections: Array.from({ length: 61 }, () => ({ heading: 'H', body: 'B' })) }, 'sections'],
    ['a page that is too long in total', { sections: Array.from({ length: 16 }, () => ({ heading: 'H', body: 'x'.repeat(3_900) })) }, 'body'],
  ])('refuses %s and saves nothing', async (_name, body, field) => {
    const res = await save('refunds', body)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(res.body.errors).toHaveProperty([field])
    expect(await SiteContent.countDocuments()).toBe(0)
    expect(await AuditRecord.countDocuments()).toBe(0)
  })
})

describe('request size', () => {
  // Over the site-content routes' 256kb limit: the answer shows whether the body was read.
  const huge = { sections: [{ heading: 'H', body: 'x'.repeat(300_000) }] }

  it('reads a large body only after the admin login check', async () => {
    expect((await request(app).patch(`${ADMIN}/faq`).send(huge)).status).toBe(401)
    expect((await save('faq', huge)).status).toBe(413)
  })

  it('keeps the 32kb limit on every other route', async () => {
    const res = await request(app).post('/api/contact-requests').send({ fullName: 'A', email: 'a@example.com', message: 'x'.repeat(40_000) })
    expect(res.status).toBe(413)
  })
})
