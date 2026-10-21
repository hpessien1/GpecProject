import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import Enquiry from '../src/models/Enquiry.js'
import Product from '../src/models/Product.js'
import { seedSampleProducts } from '../src/services/products.js'
import { testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()
beforeEach(async () => { await seedSampleProducts() })

function validEnquiry() {
  return {
    customer: { fullName: 'Ada Buyer', company: 'Acme Ltd', email: 'Ada@Example.com', phone: '0800 000 0000' },
    location: 'Lagos',
    notes: 'Needed this month.',
    items: [{ productId: 'panel-001', quantity: 1 }, { productId: 'solar-001', quantity: 1 }, { productId: 'panel-001', quantity: 2 }],
  }
}

describe('POST /api/enquiries', () => {
  it('saves a valid enquiry with server-side product details and merged quantities', async () => {
    const res = await request(app).post('/api/enquiries').send(validEnquiry())
    expect(res.status).toBe(201)
    expect(res.body.reference).toMatch(/^GPEC-\d{4}-[0-9A-F]{8}$/)

    const saved = await Enquiry.findOne({ reference: res.body.reference }).lean()
    expect(saved?.customer?.email).toBe('ada@example.com')
    expect(saved?.status).toBe('new')
    expect(saved?.items).toEqual([
      { productId: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', quantity: 3 },
      { productId: 'solar-001', name: 'Solar power package', reference: 'GPEC-SOL-020', quantity: 1 },
    ])
  })

  it('ignores names, references and status sent by the client', async () => {
    const tampered = {
      ...validEnquiry(),
      reference: 'MY-OWN-REF',
      status: 'paid',
      items: [{ productId: 'panel-001', quantity: 1, name: 'Free panel', reference: 'FAKE-001' }],
    }
    const res = await request(app).post('/api/enquiries').send(tampered)
    expect(res.status).toBe(201)
    expect(res.body.reference).not.toBe('MY-OWN-REF')

    const saved = await Enquiry.findOne({ reference: res.body.reference }).lean()
    expect(saved?.status).toBe('new')
    expect(saved?.items).toEqual([{ productId: 'panel-001', name: 'Custom control panel', reference: 'GPEC-CP-001', quantity: 1 }])
  })

  it('rejects unknown products without saving anything', async () => {
    const res = await request(app).post('/api/enquiries').send({ ...validEnquiry(), items: [{ productId: 'not-a-product', quantity: 1 }] })
    expect(res.status).toBe(400)
    expect(res.body.errors.items).toBe('One or more selected products are unavailable.')
    expect(await Enquiry.countDocuments()).toBe(0)
  })

  it('rejects archived products', async () => {
    await Product.updateOne({ _id: 'solar-001' }, { status: 'archived' })
    const res = await request(app).post('/api/enquiries').send(validEnquiry())
    expect(res.status).toBe(400)
    expect(res.body.errors.items).toBe('One or more selected products are unavailable.')
    expect(await Enquiry.countDocuments()).toBe(0)
  })

  it('uses the product name and reference stored in the database', async () => {
    await Product.updateOne({ _id: 'panel-001' }, { name: 'Renamed panel' })
    const res = await request(app).post('/api/enquiries').send({ ...validEnquiry(), items: [{ productId: 'panel-001', quantity: 1 }] })
    const saved = await Enquiry.findOne({ reference: res.body.reference }).lean()
    expect(saved?.items).toEqual([{ productId: 'panel-001', name: 'Renamed panel', reference: 'GPEC-CP-001', quantity: 1 }])
  })

  it('treats a MongoDB query operator as a product ID as unavailable', async () => {
    const res = await request(app).post('/api/enquiries').send({ ...validEnquiry(), items: [{ productId: { $ne: '' }, quantity: 1 }] })
    expect(res.status).toBe(400)
    expect(res.body.errors.items).toBe('One or more selected products are unavailable.')
  })

  it.each([0, 1001, 1.5, 'two'])('rejects quantity %s', async (quantity) => {
    const res = await request(app).post('/api/enquiries').send({ ...validEnquiry(), items: [{ productId: 'panel-001', quantity }] })
    expect(res.status).toBe(400)
    expect(res.body.errors.items).toBe('Each product quantity must be between 1 and 1000.')
  })

  it('rejects merged quantities above 1000', async () => {
    const items = [{ productId: 'panel-001', quantity: 600 }, { productId: 'panel-001', quantity: 600 }]
    const res = await request(app).post('/api/enquiries').send({ ...validEnquiry(), items })
    expect(res.status).toBe(400)
  })

  it('requires at least one item and allows at most 50 product lines', async () => {
    const empty = await request(app).post('/api/enquiries').send({ ...validEnquiry(), items: [] })
    expect(empty.body.errors.items).toBe('At least one product is required.')
    const tooMany = Array.from({ length: 51 }, () => ({ productId: 'panel-001', quantity: 1 }))
    const res = await request(app).post('/api/enquiries').send({ ...validEnquiry(), items: tooMany })
    expect(res.status).toBe(400)
  })

  it('treats MongoDB query operators in fields as missing values', async () => {
    const res = await request(app).post('/api/enquiries').send({ ...validEnquiry(), customer: { ...validEnquiry().customer, fullName: { $gt: '' } } })
    expect(res.status).toBe(400)
    expect(res.body.errors.fullName).toBe('fullName is required.')
  })

  it('reports invalid email and missing required customer fields', async () => {
    const res = await request(app).post('/api/enquiries').send({ ...validEnquiry(), customer: { email: 'not-an-email' } })
    expect(res.status).toBe(400)
    expect(res.body.errors).toMatchObject({ fullName: 'fullName is required.', phone: 'phone is required.', email: 'email must be valid.' })
  })
})
