import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { sampleProducts } from '../src/data/sampleProducts.js'
import Product from '../src/models/Product.js'
import { seedSampleProducts } from '../src/services/products.js'
import { testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()

describe('GET /api/products', () => {
  it('returns an empty list, with the configured currency, when there are no products', async () => {
    const res = await request(app).get('/api/products')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ products: [], currency: { code: 'NGN', minorUnitDigits: 2 } })
  })

  it('returns active products in sort order, labelled as placeholders, with prices once the currency is set', async () => {
    await seedSampleProducts()
    await Product.updateOne({ _id: 'panel-001' }, { price: 150000 })
    const res = await request(app).get('/api/products')
    expect(res.status).toBe(200)
    expect(res.body.currency).toEqual({ code: 'NGN', minorUnitDigits: 2 })
    expect(res.body.products.map((product: { id: string }) => product.id)).toEqual(sampleProducts.map((product) => product.id))
    expect(res.body.products[0]).toEqual({
      id: 'panel-001',
      name: 'Custom control panel',
      reference: 'GPEC-CP-001',
      description: sampleProducts[0].description,
      specs: sampleProducts[0].specs,
      image: sampleProducts[0].image,
      alt: sampleProducts[0].alt,
      isPlaceholder: true,
      inStock: true,
      deliveryAvailable: true,
      price: 150000,
    })
    // A product staff have not priced yet.
    expect(res.body.products[1].price).toBeNull()
  })

  it('leaves prices out while no currency is configured, so a bare number is never shown', async () => {
    await seedSampleProducts()
    await Product.updateOne({ _id: 'panel-001' }, { price: 150000 })
    const res = await request(testApp({ currency: null })).get('/api/products')
    expect(res.body.currency).toBeNull()
    expect(res.body.products.every((product: object) => !('price' in product))).toBe(true)
  })

  it('shows a price change made by staff straight away', async () => {
    await seedSampleProducts()
    await Product.updateOne({ _id: 'panel-001' }, { price: 150000 })
    await Product.updateOne({ _id: 'panel-001' }, { price: 175050 })
    const res = await request(app).get('/api/products')
    expect(res.body.products[0].price).toBe(175050)
  })

  it('leaves out archived products', async () => {
    await seedSampleProducts()
    await Product.updateOne({ _id: 'solar-001' }, { status: 'archived' })
    const res = await request(app).get('/api/products')
    expect(res.body.products).toHaveLength(sampleProducts.length - 1)
    expect(res.body.products.some((product: { id: string }) => product.id === 'solar-001')).toBe(false)
  })
})

describe('seedSampleProducts', () => {
  it('adds every sample product once and leaves existing products unchanged on a second run', async () => {
    expect(await seedSampleProducts()).toEqual({ added: sampleProducts.length, alreadyPresent: 0 })
    await Product.updateOne({ _id: 'panel-001' }, { name: 'Edited by GPEC', price: 250000 })

    expect(await seedSampleProducts()).toEqual({ added: 0, alreadyPresent: sampleProducts.length })
    const edited = await Product.findById('panel-001').lean()
    expect(edited).toMatchObject({ name: 'Edited by GPEC', price: 250000 })
    expect(await Product.countDocuments()).toBe(sampleProducts.length)
  })

  it('restores only the products that are missing', async () => {
    await seedSampleProducts()
    await Product.deleteOne({ _id: 'cable-001' })
    expect(await seedSampleProducts()).toEqual({ added: 1, alreadyPresent: sampleProducts.length - 1 })
  })
})

describe('Product model', () => {
  const valid = { _id: 'test-001', name: 'Test', reference: 'TEST-001', description: 'Test product', image: '/assets/x.png', alt: 'Test' }

  it('starts with no price, active, and not a placeholder', async () => {
    const product = await Product.create(valid)
    expect(product.price).toBeNull()
    expect(product.status).toBe('active')
    expect(product.isPlaceholder).toBe(false)
  })

  it.each([12.5, -1])('rejects price %s (must be a whole number of the smallest unit, not negative)', async (price) => {
    await expect(Product.create({ ...valid, price })).rejects.toThrow(/price/)
  })

  it('rejects an unknown status and unknown fields', async () => {
    await expect(Product.create({ ...valid, status: 'deleted' })).rejects.toThrow(/status/)
    await expect(Product.create({ ...valid, discount: 10 })).rejects.toThrow(/discount/)
  })

  it('rejects a duplicate customer-facing reference', async () => {
    await Product.syncIndexes()
    await Product.create(valid)
    await expect(Product.create({ ...valid, _id: 'test-002' })).rejects.toThrow(/duplicate key/)
  })
})
