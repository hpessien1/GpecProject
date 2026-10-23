import mongoose from 'mongoose'
import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { beforeEach, describe, expect, it } from 'vitest'
import AdminUser from '../src/models/AdminUser.js'
import AuditRecord from '../src/models/AuditRecord.js'
import DeliveryArea from '../src/models/DeliveryArea.js'
import RequestNote from '../src/models/RequestNote.js'
import { seedDemoData } from '../src/services/demoData.js'
import { seedSampleProducts } from '../src/services/products.js'
import { ADMIN_PAGE_SIZE } from '../src/utils/paging.js'
import { TEST_ADMIN, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

// Change histories and staff notes come a page at a time, newest first, with a cursor for the next,
// older page, so no entry is ever out of reach (they used to stop silently at the newest 50 or 100).
useTestDatabase()
const app = testApp()
const ORIGIN = 'http://localhost:5173'
// From src/data/demoData.ts and src/data/sampleProducts.ts.
const ORDER = 'GPEC-O-2026-DE000001'
const REQUEST = 'GPEC-C-2026-DE000001'
const PRODUCT = 'panel-001'
const START = Date.parse('2026-01-01T00:00:00Z')

let agent: TestAgent
beforeEach(async () => {
  await createTestAdmin()
  await seedSampleProducts()
  await seedDemoData()
  agent = await loggedInAgent(app)
})

type Target = 'product' | 'contactRequest' | 'order' | 'deliveryArea' | 'bankTransfer'
const ACTIONS: Record<Target, string> = { product: 'product.update', contactRequest: 'contactRequest.status', order: 'order.status', deliveryArea: 'deliveryArea.update', bankTransfer: 'bankTransfer.update' }

// `count` records a minute apart, the newest last; record i changes sortOrder to i, so each is easy to
// tell apart. Written straight to the collection so the dates stay as given.
async function addHistory(targetType: Target, targetId: string, count: number, at = (i: number) => new Date(START + i * 60_000)) {
  const admin = await AdminUser.findOne({ email: TEST_ADMIN.email }).lean()
  await AuditRecord.deleteMany({ targetType, targetId })
  await AuditRecord.collection.insertMany(Array.from({ length: count }, (_, i) => ({
    action: ACTIONS[targetType], targetType, targetId, orderReference: null, createdAt: at(i),
    actor: { adminId: admin!._id, email: TEST_ADMIN.email, name: TEST_ADMIN.name },
    changes: [{ field: 'sortOrder', from: i - 1, to: i }],
  })))
}

async function addNotes(targetType: 'order' | 'contactRequest', targetId: string, count: number) {
  const admin = await AdminUser.findOne({ email: TEST_ADMIN.email }).lean()
  await RequestNote.deleteMany({ targetType, targetId })
  await RequestNote.collection.insertMany(Array.from({ length: count }, (_, i) => ({
    targetType, targetId, text: `Note ${i}`, createdAt: new Date(START + i * 60_000),
    author: { adminId: admin!._id, email: TEST_ADMIN.email, name: TEST_ADMIN.name },
  })))
}

const changedTo = (history: { changes: { to: number }[] }[]) => history.map((entry) => entry.changes[0].to)
const descending = (from: number, count: number) => Array.from({ length: count }, (_, i) => from - i)

// Follows the cursors from the first page to the last, as the "Show older" button does.
async function readAll(path: string, first: { list: unknown[], cursor: string | null }, key: 'history' | 'notes') {
  const all = [...first.list]
  let cursor = first.cursor
  let pages = 1
  while (cursor) {
    const res = await agent.get(path).query({ before: cursor })
    expect(res.status).toBe(200)
    all.push(...res.body[key])
    cursor = res.body[`${key}Cursor`]
    pages += 1
  }
  return { all, pages }
}

describe('change history pages', () => {
  it('pages through a product history to the oldest change, each change once', async () => {
    const total = ADMIN_PAGE_SIZE * 2 + 5
    await addHistory('product', PRODUCT, total)
    const path = `/api/admin/products/${PRODUCT}/history`
    const first = await agent.get(path)
    expect(first.status).toBe(200)
    expect(first.body.history).toHaveLength(ADMIN_PAGE_SIZE)
    expect(changedTo(first.body.history)).toEqual(descending(total - 1, ADMIN_PAGE_SIZE))
    expect(first.body.historyCursor).toEqual(expect.any(String))
    const { all, pages } = await readAll(path, { list: first.body.history, cursor: first.body.historyCursor }, 'history')
    expect(pages).toBe(3)
    expect(changedTo(all as { changes: { to: number }[] }[])).toEqual(descending(total - 1, total))
  })

  it('has no cursor when everything fits on one page', async () => {
    await addHistory('product', PRODUCT, ADMIN_PAGE_SIZE)
    const res = await agent.get(`/api/admin/products/${PRODUCT}/history`)
    expect(res.body.history).toHaveLength(ADMIN_PAGE_SIZE)
    expect(res.body.historyCursor).toBeNull()
  })

  it('keeps changes made in the same millisecond apart, and skips none', async () => {
    const total = ADMIN_PAGE_SIZE + 10
    await addHistory('product', PRODUCT, total, () => new Date(START))
    const path = `/api/admin/products/${PRODUCT}/history`
    const first = await agent.get(path)
    const { all } = await readAll(path, { list: first.body.history, cursor: first.body.historyCursor }, 'history')
    expect(new Set(changedTo(all as { changes: { to: number }[] }[])).size).toBe(total)
  })

  it('shows nothing twice when a change arrives while staff read', async () => {
    const total = ADMIN_PAGE_SIZE + 5
    await addHistory('product', PRODUCT, total)
    const path = `/api/admin/products/${PRODUCT}/history`
    const first = await agent.get(path)
    // A sale is recorded after the first page was read.
    await AuditRecord.create({ action: 'product.sale', targetType: 'product', targetId: PRODUCT, orderReference: ORDER, changes: [{ field: 'stockQuantity', from: 5, to: 4 }] })
    const older = await agent.get(path).query({ before: first.body.historyCursor })
    expect(changedTo(older.body.history)).toEqual(descending(4, 5))
    expect(older.body.historyCursor).toBeNull()
  })

  it.each([
    ['an order', 'order', ORDER, `/api/admin/orders/${ORDER}`, `/api/admin/orders/${ORDER}/history`],
    ['a contact request', 'contactRequest', REQUEST, `/api/admin/contact-requests/${REQUEST}`, `/api/admin/contact-requests/${REQUEST}/history`],
    ['the bank details', 'bankTransfer', 'bank-transfer', '/api/admin/bank-transfer', '/api/admin/bank-transfer/history'],
  ] as const)('gives %s the newest page with the record, and older pages on their own', async (_name, targetType, targetId, detailPath, historyPath) => {
    const total = ADMIN_PAGE_SIZE + 3
    await addHistory(targetType, targetId, total)
    const detail = await agent.get(detailPath)
    expect(detail.status).toBe(200)
    expect(changedTo(detail.body.history)).toEqual(descending(total - 1, ADMIN_PAGE_SIZE))
    const older = await agent.get(historyPath).query({ before: detail.body.historyCursor })
    expect(older.status).toBe(200)
    expect(older.headers['cache-control']).toBe('no-store')
    expect(changedTo(older.body.history)).toEqual(descending(2, 3))
    expect(older.body.historyCursor).toBeNull()
  })

  it('pages a delivery area history the same way', async () => {
    const area = await DeliveryArea.findOne().lean()
    const id = String(area!._id)
    await addHistory('deliveryArea', id, ADMIN_PAGE_SIZE + 1)
    const path = `/api/admin/delivery-areas/${id}/history`
    const first = await agent.get(path)
    const older = await agent.get(path).query({ before: first.body.historyCursor })
    expect(changedTo(older.body.history)).toEqual([0])
  })
})

describe('staff note pages', () => {
  it.each([
    ['an order', 'order', ORDER, `/api/admin/orders/${ORDER}`],
    ['a contact request', 'contactRequest', REQUEST, `/api/admin/contact-requests/${REQUEST}`],
  ] as const)('gives %s the newest notes with the record, and every older one after', async (_name, targetType, targetId, detailPath) => {
    const total = ADMIN_PAGE_SIZE * 4 + 2
    await addNotes(targetType, targetId, total)
    const detail = await agent.get(detailPath)
    expect(detail.body.notes).toHaveLength(ADMIN_PAGE_SIZE)
    expect(detail.body.notes[0].text).toBe(`Note ${total - 1}`)
    const { all } = await readAll(`${detailPath}/notes`, { list: detail.body.notes, cursor: detail.body.notesCursor }, 'notes')
    expect((all as { text: string }[]).map((note) => note.text)).toEqual(descending(total - 1, total).map((i) => `Note ${i}`))
  })

  it('still answers a new note with the newest page', async () => {
    await addNotes('order', ORDER, ADMIN_PAGE_SIZE + 1)
    const res = await agent.post(`/api/admin/orders/${ORDER}/notes`).set('Origin', ORIGIN).send({ text: 'Called the customer.' })
    expect(res.status).toBe(201)
    expect(res.body.notes[0].text).toBe('Called the customer.')
    expect(res.body.notes).toHaveLength(ADMIN_PAGE_SIZE)
    expect(res.body.notesCursor).toEqual(expect.any(String))
  })
})

describe('older-page requests are checked', () => {
  const paths = [
    `/api/admin/products/${PRODUCT}/history`,
    `/api/admin/orders/${ORDER}/history`,
    `/api/admin/orders/${ORDER}/notes`,
    `/api/admin/contact-requests/${REQUEST}/history`,
    `/api/admin/contact-requests/${REQUEST}/notes`,
    '/api/admin/bank-transfer/history',
  ]

  it.each(paths)('%s is for admins only', async (path) => {
    await addNotes('order', ORDER, 1)
    const res = await request(app).get(path)
    expect(res.status).toBe(401)
    expect(JSON.stringify(res.body)).not.toContain('Note')
  })

  it.each(paths)('%s refuses a cursor that is not one', async (path) => {
    for (const before of ['yesterday', '123-xyz', `${'9'.repeat(16)}-${'a'.repeat(24)}`, '']) {
      const res = await agent.get(path).query({ before })
      expect(res.status).toBe(400)
      expect(res.body.errors).toHaveProperty('before')
    }
    // Repeated, it arrives as a list, which is refused.
    expect((await agent.get(`${path}?before=1-${'a'.repeat(24)}&before=2-${'b'.repeat(24)}`)).status).toBe(400)
    // Express 5's query parser makes no objects, so this is an unknown parameter named "before[$gt]",
    // ignored like any other: the newest page, and no operator reaches the database.
    const operator = await agent.get(`${path}?before[$gt]=`)
    expect(operator.status).toBe(200)
    expect(operator.body).not.toHaveProperty('errors')
  })

  it.each([
    '/api/admin/products/no-such-product/history',
    '/api/admin/orders/GPEC-O-2026-FFFFFFFF/history',
    '/api/admin/orders/GPEC-O-2026-FFFFFFFF/notes',
    '/api/admin/contact-requests/GPEC-C-2026-FFFFFFFF/history',
    '/api/admin/contact-requests/GPEC-C-2026-FFFFFFFF/notes',
    `/api/admin/delivery-areas/${new mongoose.Types.ObjectId().toHexString()}/history`,
  ])('%s is 404 for a record that does not exist', async (path) => {
    expect((await agent.get(path)).status).toBe(404)
  })
})
