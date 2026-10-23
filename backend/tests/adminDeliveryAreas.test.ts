import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { beforeEach, describe, expect, it } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import { TEST_ADMIN, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()
const ORIGIN = 'http://localhost:5173'
const LIST = '/api/admin/delivery-areas'

let agent: TestAgent
beforeEach(async () => {
  await createTestAdmin()
  agent = await loggedInAgent(app)
})

function create(body: object) {
  return agent.post(LIST).set('Origin', ORIGIN).send(body)
}

function update(id: string, body: object, origin = ORIGIN) {
  return agent.patch(`${LIST}/${id}`).set('Origin', origin).send(body)
}

describe('delivery areas (admin)', () => {
  it('is for admins only', async () => {
    for (const [method, path] of [['get', LIST], ['post', LIST], ['patch', `${LIST}/0123456789abcdef01234567`]] as const) {
      expect((await request(app)[method](path).send({ name: 'X', fee: 1 })).status).toBe(401)
    }
  })

  it('creates an area with its fee, lists it, and records who did it', async () => {
    const res = await create({ name: 'Port Harcourt', description: 'Woji, GRA', fee: 300_000 })
    expect(res.status).toBe(201)
    expect(res.body.area).toMatchObject({ name: 'Port Harcourt', description: 'Woji, GRA', fee: 300_000, status: 'active', sortOrder: 10 })
    const list = await agent.get(LIST)
    expect(list.headers['cache-control']).toBe('no-store')
    expect(list.body.areas.map((area: { name: string }) => area.name)).toEqual(['Port Harcourt'])
    const [record] = await AuditRecord.find({ targetType: 'deliveryArea' }).lean()
    expect(record).toMatchObject({ action: 'deliveryArea.create', targetId: res.body.area.id, actor: { email: TEST_ADMIN.email, name: TEST_ADMIN.name } })
  })

  it('records a fee change (old and new value), shows it in the history, and records nothing for no change', async () => {
    const { body } = await create({ name: 'Lagos', fee: 2_500_000 })
    const res = await update(body.area.id, { fee: 3_000_000, name: 'Lagos' })
    expect(res.body.area.fee).toBe(3_000_000)
    await update(body.area.id, { fee: 3_000_000 })
    const history = await agent.get(`${LIST}/${body.area.id}/history`)
    expect(history.body.history).toHaveLength(2)
    expect(history.body.history[0]).toMatchObject({ action: 'deliveryArea.update', changes: [{ field: 'fee', from: 2_500_000, to: 3_000_000 }], actor: { name: TEST_ADMIN.name } })
  })

  it('archives instead of deleting, which takes the area out of the checkout', async () => {
    const { body } = await create({ name: 'Abuja', fee: 2_000_000 })
    await update(body.area.id, { status: 'archived' })
    expect((await agent.delete(`${LIST}/${body.area.id}`).set('Origin', ORIGIN)).status).toBe(404)
    expect((await agent.get(LIST)).body.areas[0].status).toBe('archived')
  })

  it.each([
    [{ name: '', fee: 100 }, 'name'],
    [{ name: 'X' }, 'fee'],
    [{ name: 'X', fee: -1 }, 'fee'],
    [{ name: 'X', fee: 1.5 }, 'fee'],
    [{ name: 'X', fee: '100' }, 'fee'],
    [{ name: { $gt: '' }, fee: 100 }, 'name'],
    [{ name: 'X', fee: 100, status: 'deleted' }, 'status'],
    [{ name: 'X', fee: 100, createdAt: '2020-01-01' }, 'createdAt'],
  ])('refuses %j', async (body, field) => {
    const res = await create(body)
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.errors)).toContain(field)
  })

  it('refuses a second area with the same name', async () => {
    await create({ name: 'Port Harcourt', fee: 1 })
    const res = await create({ name: 'Port Harcourt', fee: 2 })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('DELIVERY_AREA_CONFLICT')
  })

  it('refuses fees while the shop currency is not configured', async () => {
    const noCurrency = testApp({ currency: null })
    const noCurrencyAgent = await loggedInAgent(noCurrency)
    const res = await noCurrencyAgent.post(LIST).set('Origin', ORIGIN).send({ name: 'X', fee: 100 })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CURRENCY_NOT_CONFIGURED')
  })

  it('refuses changes from another site and answers 404 for unknown areas', async () => {
    const { body } = await create({ name: 'Port Harcourt', fee: 1 })
    expect((await update(body.area.id, { fee: 2 }, 'https://evil.example')).status).toBe(403)
    expect((await update('0123456789abcdef01234567', { fee: 2 })).status).toBe(404)
    expect((await update('not-an-id', { fee: 2 })).status).toBe(404)
  })
})
