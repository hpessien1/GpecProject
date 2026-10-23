import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditRecord from '../src/models/AuditRecord.js'
import Product from '../src/models/Product.js'
import { seedSampleProducts } from '../src/services/products.js'
import { TEST_ADMIN, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()
const ORIGIN = 'http://localhost:5173'

const newProduct = {
  id: 'panel-099',
  name: '[TEST] New panel',
  reference: 'GPEC-TEST-099',
  description: 'Test product.',
  specs: ['Test spec'],
  image: '/assets/electrical-panels-product.png',
  alt: 'Test image',
}

let agent: TestAgent
beforeEach(async () => {
  await seedSampleProducts()
  await createTestAdmin()
  agent = await loggedInAgent(app)
})

function patch(id: string, body: object, target: TestAgent = agent) {
  return target.patch(`/api/admin/products/${id}`).set('Origin', ORIGIN).send(body)
}

describe('admin product routes require a logged-in admin', () => {
  it.each([
    ['get', '/api/admin/products'],
    ['post', '/api/admin/products'],
    ['get', '/api/admin/products/panel-001'],
    ['patch', '/api/admin/products/panel-001'],
    ['get', '/api/admin/products/panel-001/history'],
  ] as const)('%s %s without a session is 401', async (method, path) => {
    const res = await request(app)[method](path).send({ price: 1 })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('ADMIN_AUTH_REQUIRED')
  })

  it('refuses a change sent from another site, even with a valid session', async () => {
    const res = await agent.patch('/api/admin/products/panel-001').set('Origin', 'https://attacker.example').send({ price: 1 })
    expect(res.status).toBe(403)
    expect((await Product.findById('panel-001').lean())?.price).toBeNull()
  })
})

describe('GET /api/admin/products', () => {
  it('lists every product, including archived ones, with price and status', async () => {
    await Product.updateOne({ _id: 'solar-001' }, { status: 'archived', price: 500000 })
    const res = await agent.get('/api/admin/products')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ page: 1, totalPages: 1, total: 14 })
    expect(res.body.products.find((product: { id: string }) => product.id === 'solar-001')).toMatchObject({ status: 'archived', price: 500000, isPlaceholder: true })
  })

  it.each(['0', 'abc', '1.5'])('rejects page=%s', async (page) => {
    expect((await agent.get(`/api/admin/products?page=${page}`)).status).toBe(400)
  })
})

describe('GET /api/admin/products/:id', () => {
  it('returns one product with its admin-only fields, or 404', async () => {
    const res = await agent.get('/api/admin/products/panel-001')
    expect(res.status).toBe(200)
    expect(res.body.product).toMatchObject({ id: 'panel-001', reference: 'GPEC-CP-001', price: null, status: 'active', isPlaceholder: true })
    expect((await agent.get('/api/admin/products/nope')).status).toBe(404)
    expect((await agent.get('/api/admin/products/Not%20Valid')).status).toBe(404)
  })
})

describe('POST /api/admin/products', () => {
  it('creates a product at the end of the list and records who created it', async () => {
    const res = await agent.post('/api/admin/products').set('Origin', ORIGIN).send({ ...newProduct, price: 1500000 })
    expect(res.status).toBe(201)
    expect(res.body.product).toMatchObject({ id: 'panel-099', price: 1500000, status: 'active', isPlaceholder: false, sortOrder: 150 })

    const audit = await AuditRecord.findOne({ targetId: 'panel-099' }).lean()
    expect(audit).toMatchObject({ action: 'product.create', actor: { email: TEST_ADMIN.email, name: TEST_ADMIN.name } })
    expect(audit?.changes).toContainEqual({ field: 'price', from: null, to: 1500000 })
  })

  it('refuses a duplicate ID or reference with 409', async () => {
    expect((await agent.post('/api/admin/products').set('Origin', ORIGIN).send({ ...newProduct, id: 'panel-001' })).status).toBe(409)
    const res = await agent.post('/api/admin/products').set('Origin', ORIGIN).send({ ...newProduct, reference: 'GPEC-CP-001' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PRODUCT_CONFLICT')
    expect(await AuditRecord.countDocuments()).toBe(0)
  })

  it('reports missing, unknown, and badly formed fields', async () => {
    const res = await agent.post('/api/admin/products').set('Origin', ORIGIN).send({ id: 'Bad ID', name: '', image: 'https://elsewhere.example/x.png', createdBy: 'me' })
    expect(res.status).toBe(400)
    expect(res.body.errors).toMatchObject({
      id: expect.stringContaining('lowercase'),
      name: 'name is required.',
      image: expect.stringContaining('/assets/'),
      createdBy: 'createdBy is not an editable field.',
      reference: 'reference is required.',
    })
  })
})

describe('PATCH /api/admin/products/:id', () => {
  it('changes the price and records old value, new value, who, and when', async () => {
    const res = await patch('panel-001', { price: 2500000 })
    expect(res.status).toBe(200)
    expect(res.body.product.price).toBe(2500000)

    await patch('panel-001', { price: 2750000 })
    const history = await agent.get('/api/admin/products/panel-001/history')
    expect(history.body.history).toHaveLength(2)
    expect(history.body.history[0]).toMatchObject({
      action: 'product.update',
      actor: { name: TEST_ADMIN.name, email: TEST_ADMIN.email },
      changes: [{ field: 'price', from: 2500000, to: 2750000 }],
    })
    expect(new Date(history.body.history[0].createdAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('records only the fields that actually change, and nothing for a no-op', async () => {
    const res = await patch('panel-001', { name: 'Custom control panel', status: 'archived' })
    expect(res.status).toBe(200)
    const records = await AuditRecord.find({ targetId: 'panel-001' }).lean()
    expect(records).toHaveLength(1)
    expect(records[0].changes).toEqual([{ field: 'status', from: 'active', to: 'archived' }])

    await patch('panel-001', { status: 'archived' })
    expect(await AuditRecord.countDocuments({ targetId: 'panel-001' })).toBe(1)
  })

  describe('stock', () => {
    async function shopProduct(id: string) {
      const res = await request(app).get('/api/products')
      return res.body.products.find((product: { id: string }) => product.id === id)
    }

    it('shows a product as out of stock when staff switch it off, keeping it in the shop, and records it', async () => {
      const res = await patch('solar-001', { outOfStock: true })
      expect(res.status).toBe(200)
      expect(res.body.product).toMatchObject({ outOfStock: true, stockQuantity: null })
      expect(await shopProduct('solar-001')).toMatchObject({ id: 'solar-001', inStock: false })
      const [record] = await AuditRecord.find({ targetId: 'solar-001' }).lean()
      expect(record.changes).toEqual([{ field: 'outOfStock', from: false, to: true }])
      await patch('solar-001', { outOfStock: false })
      expect((await shopProduct('solar-001')).inStock).toBe(true)
    })

    it('counts stock when a number is given: 0 is out of stock, and customers never see the number', async () => {
      await patch('solar-001', { stockQuantity: 3 })
      const inStock = await shopProduct('solar-001')
      expect(inStock.inStock).toBe(true)
      expect(inStock).not.toHaveProperty('stockQuantity')
      expect(inStock).not.toHaveProperty('outOfStock')
      await patch('solar-001', { stockQuantity: 0 })
      expect((await shopProduct('solar-001')).inStock).toBe(false)
      await patch('solar-001', { stockQuantity: null })
      expect((await shopProduct('solar-001')).inStock).toBe(true)
    })

    it('treats the switch as stronger than a count', async () => {
      await patch('solar-001', { stockQuantity: 10, outOfStock: true })
      expect((await shopProduct('solar-001')).inStock).toBe(false)
    })

    it.each([
      [{ stockQuantity: -1 }, 'stockQuantity'],
      [{ stockQuantity: 2.5 }, 'stockQuantity'],
      [{ stockQuantity: '5' }, 'stockQuantity'],
      [{ stockQuantity: 1_000_001 }, 'stockQuantity'],
      [{ outOfStock: 'yes' }, 'outOfStock'],
    ])('rejects %j', async (body, field) => {
      const res = await patch('solar-001', body)
      expect(res.status).toBe(400)
      expect(Object.keys(res.body.errors)).toEqual([field])
    })

    it('reads a product saved before the stock fields existed as in stock and not counted', async () => {
      await Product.collection.updateOne({ _id: 'solar-001' as never }, { $unset: { outOfStock: '', stockQuantity: '' } })
      expect((await agent.get('/api/admin/products/solar-001')).body.product).toMatchObject({ outOfStock: false, stockQuantity: null })
      expect((await shopProduct('solar-001')).inStock).toBe(true)
      await patch('solar-001', { outOfStock: false })
      expect(await AuditRecord.countDocuments({ targetId: 'solar-001' })).toBe(0)
    })
  })

  it('marks a product pickup only, shows that in the shop, and records it', async () => {
    const res = await patch('panel-001', { deliveryAvailable: false })
    expect(res.body.product.deliveryAvailable).toBe(false)
    const shop = await request(app).get('/api/products')
    expect(shop.body.products.find((product: { id: string }) => product.id === 'panel-001').deliveryAvailable).toBe(false)
    const [record] = await AuditRecord.find({ targetId: 'panel-001' }).lean()
    expect(record.changes).toEqual([{ field: 'deliveryAvailable', from: true, to: false }])
    expect((await patch('panel-001', { deliveryAvailable: 'no' })).status).toBe(400)
  })

  it('hides an archived product from the public shop', async () => {
    await patch('solar-001', { status: 'archived' })
    const res = await request(app).get('/api/products')
    expect(res.body.products.some((product: { id: string }) => product.id === 'solar-001')).toBe(false)
  })

  it('never changes the ID, and rejects unknown fields and wrong types', async () => {
    const res = await patch('panel-001', { id: 'panel-777', price: '1500', isPlaceholder: 'no', specs: 'one', updatedAt: '2020-01-01' })
    expect(res.status).toBe(400)
    expect(res.body.errors).toMatchObject({ id: 'id cannot be changed.', price: expect.any(String), isPlaceholder: expect.any(String), specs: expect.any(String), updatedAt: 'updatedAt is not an editable field.' })
    expect(await AuditRecord.countDocuments()).toBe(0)
  })

  it('treats a MongoDB query operator as an invalid value', async () => {
    const res = await patch('panel-001', { price: { $gt: 0 }, name: { $ne: '' } })
    expect(res.status).toBe(400)
    expect(res.body.errors).toMatchObject({ price: expect.any(String), name: 'name is required.' })
  })

  it('returns 404 for an unknown product and refuses an empty change', async () => {
    expect((await patch('does-not-exist', { name: 'X' })).status).toBe(404)
    expect((await patch('panel-001', {})).body.errors.body).toBe('Send at least one field to change.')
  })

  it('refuses a duplicate reference and leaves the product unchanged', async () => {
    const res = await patch('panel-001', { reference: 'GPEC-SOL-020' })
    expect(res.status).toBe(409)
    expect((await Product.findById('panel-001').lean())?.reference).toBe('GPEC-CP-001')
    expect(await AuditRecord.countDocuments()).toBe(0)
  })

  it('does not change the product if its audit record cannot be saved', async () => {
    const spy = vi.spyOn(AuditRecord, 'create').mockRejectedValueOnce(new Error('audit write failed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await patch('panel-001', { price: 999 })
    spy.mockRestore()
    consoleSpy.mockRestore()
    expect(res.status).toBe(500)
    expect((await Product.findById('panel-001').lean())?.price).toBeNull()
  })

  it('refuses to set a price while no currency is configured, but allows other edits', async () => {
    const noCurrency = testApp({ currency: null })
    const noCurrencyAgent = await loggedInAgent(noCurrency)
    const res = await patch('panel-001', { price: 1000 }, noCurrencyAgent)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CURRENCY_NOT_CONFIGURED')
    expect((await patch('panel-001', { name: 'Renamed' }, noCurrencyAgent)).status).toBe(200)
  })
})

describe('GET /api/admin/products/:id/history', () => {
  it('returns 404 for an unknown product', async () => {
    expect((await agent.get('/api/admin/products/nope/history')).status).toBe(404)
  })
})
