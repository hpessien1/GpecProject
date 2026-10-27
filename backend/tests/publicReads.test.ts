import mongoose from 'mongoose'
import request from 'supertest'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import Product from '../src/models/Product.js'
import SiteContent from '../src/models/SiteContent.js'
import type { ImageStore, StoredImage } from '../src/services/imageStore.js'
import { cachingImageStore } from '../src/services/imageCache.js'
import { seedSampleProducts } from '../src/services/products.js'
import { MemoryImageStore, TEST_ADMIN, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()

// Audit M-08: anyone can ask for the catalogue, the site's text, product photos, and the health check
// as often as they like. Each used to reach the database or Amazon S3 every time; the API now keeps
// short-lived copies (dropped as soon as the data changes) and limits how often one address can ask.

const ORIGIN = 'http://localhost:5173'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// Counts reads that reach the database for one model.
function countReads(model: typeof Product | typeof SiteContent, method: 'find' | 'findById') {
  return vi.spyOn(model, method as 'find')
}

describe('the catalogue', () => {
  let app: ReturnType<typeof testApp>
  beforeEach(async () => {
    await seedSampleProducts()
    app = testApp()
  })

  it('reads the database once for many requests at the same moment', async () => {
    const reads = countReads(Product, 'find')
    const answers = await Promise.all(Array.from({ length: 20 }, () => request(app).get('/api/products')))
    expect(answers.every((res) => res.status === 200 && res.body.products.length === 14)).toBe(true)
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it('reads it again only after 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const reads = countReads(Product, 'find')
    await request(app).get('/api/products')
    vi.advanceTimersByTime(29_000)
    await request(app).get('/api/products')
    expect(reads).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2_000)
    await request(app).get('/api/products')
    expect(reads).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed read: the next request tries again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Product, 'find').mockImplementationOnce(() => { throw new Error('database unavailable') })
    expect((await request(app).get('/api/products')).status).toBe(500)
    expect((await request(app).get('/api/products')).status).toBe(200)
    error.mockRestore()
  })

  it('shows a change at once, however it was made', async () => {
    expect((await request(app).get('/api/products')).body.products[0].name).not.toBe('[TEST] Renamed')
    // A direct database write, like a paid order lowering stock or the seed command.
    await Product.updateOne({ _id: 'panel-001' }, { name: '[TEST] Renamed' })
    expect((await request(app).get('/api/products')).body.products[0].name).toBe('[TEST] Renamed')
    // Staff in the admin panel.
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    expect((await agent.patch('/api/admin/products/panel-001').set('Origin', ORIGIN).send({ name: '[TEST] Renamed again' })).status).toBe(200)
    expect((await request(app).get('/api/products')).body.products[0].name).toBe('[TEST] Renamed again')
  })

  it('does not keep what it read while a change was being saved', async () => {
    await request(app).get('/api/products')
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        await Product.updateOne({ _id: 'panel-001' }, { name: '[TEST] Saved in a transaction' }, { session })
        // Asked for while the change is not saved yet: the old name, and it must not be kept.
        expect((await request(app).get('/api/products')).body.products[0].name).not.toBe('[TEST] Saved in a transaction')
      })
    } finally {
      await session.endSession()
    }
    expect((await request(app).get('/api/products')).body.products[0].name).toBe('[TEST] Saved in a transaction')
  })
})

describe('the site’s text (FAQ and policies)', () => {
  it('reads the database once for many requests, and shows a staff edit at once', async () => {
    const app = testApp()
    const reads = countReads(SiteContent, 'findById')
    await Promise.all(Array.from({ length: 10 }, () => request(app).get('/api/content/faq')))
    expect(reads).toHaveBeenCalledTimes(1)
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    expect((await agent.patch('/api/admin/content/faq').set('Origin', ORIGIN).send({ title: '[TEST] Questions' })).status).toBe(200)
    expect((await request(app).get('/api/content/faq')).body.title).toBe('[TEST] Questions')
  })

  it('keeps each page apart', async () => {
    const app = testApp()
    const [faq, refunds] = await Promise.all([request(app).get('/api/content/faq'), request(app).get('/api/content/refunds')])
    expect(faq.body.key).toBe('faq')
    expect(refunds.body.key).toBe('refunds')
  })
})

describe('the health check', () => {
  it('asks the database at most once every 5 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const app = testApp()
    const pings = vi.spyOn(mongoose.mongo.Admin.prototype, 'ping')
    for (let i = 0; i < 5; i++) expect((await request(app).get('/api/health')).status).toBe(200)
    expect(pings).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_001)
    await request(app).get('/api/health')
    expect(pings).toHaveBeenCalledTimes(2)
  })
})

// Counts what reaches the bucket.
class CountingStore extends MemoryImageStore {
  gets: string[] = []
  override async get(key: string) {
    this.gets.push(key)
    return super.get(key)
  }
}

const photo = () => sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 90, b: 30 } } }).png().toBuffer()

async function uploadPhoto(app: ReturnType<typeof testApp>) {
  await createTestAdmin()
  const agent = await loggedInAgent(app)
  const res = await agent.post('/api/admin/product-images').set('Origin', ORIGIN).set('Content-Type', 'image/png').send(await photo())
  expect(res.status).toBe(201)
  return String(res.body.image).replace('product-images/', '')
}

describe('product photos', () => {
  it('fetches a photo from the bucket once, however often it is asked for', async () => {
    const store = new CountingStore()
    const app = testApp({}, null, undefined, store)
    const name = await uploadPhoto(app)
    store.gets.length = 0
    const answers = await Promise.all(Array.from({ length: 10 }, () => request(app).get(`/api/product-images/${name}`)))
    for (let i = 0; i < 5; i++) answers.push(await request(app).get(`/api/product-images/${name}`))
    expect(answers.every((res) => res.status === 200 && res.headers['content-type'] === 'image/webp')).toBe(true)
    expect(store.gets.length).toBeLessThanOrEqual(1)
  })

  it('remembers a name that does not exist, until that photo is uploaded', async () => {
    const name = await uploadPhoto(testApp({}, null, undefined, new MemoryImageStore()))
    await mongoose.connection.db?.collection('adminusers').deleteMany({})
    const store = new CountingStore()
    const app = testApp({}, null, undefined, store)
    for (let i = 0; i < 5; i++) expect((await request(app).get(`/api/product-images/${name}`)).status).toBe(404)
    expect(store.gets).toHaveLength(1)
    // The same photo uploaded here gets the same name, and is then shown.
    expect(await uploadPhoto(app)).toBe(name)
    expect((await request(app).get(`/api/product-images/${name}`)).status).toBe(200)
  })
})

// A bucket that answers slowly, to see how many reads are in flight at once.
class SlowStore implements ImageStore {
  active = 0
  most = 0
  gets = 0
  constructor(private readonly objects = new Map<string, StoredImage>()) {}
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body: new Uint8Array(body), contentType })
  }
  async get(key: string) {
    this.gets++
    this.active++
    this.most = Math.max(this.most, this.active)
    await new Promise((resolve) => setTimeout(resolve, 20))
    this.active--
    return this.objects.get(key) ?? null
  }
}

describe('the photo copies kept in memory', () => {
  const image = (bytes: number) => ({ body: new Uint8Array(bytes), contentType: 'image/webp' })

  it('asks the bucket for at most 4 photos at once', async () => {
    const slow = new SlowStore()
    const cache = cachingImageStore(slow)
    await Promise.all(Array.from({ length: 12 }, (_, i) => cache.get(`product-images/${i}.webp`)))
    expect(slow.gets).toBe(12)
    expect(slow.most).toBe(4)
  })

  it('keeps no more than its size limit, dropping the least recently used first', async () => {
    const slow = new SlowStore(new Map([['product-images/a.webp', image(40)], ['product-images/b.webp', image(40)], ['product-images/c.webp', image(40)]]))
    const cache = cachingImageStore(slow, { maxBytes: 100, maxMissing: 10 })
    await cache.get('product-images/a.webp')
    await cache.get('product-images/b.webp')
    await cache.get('product-images/a.webp')
    await cache.get('product-images/c.webp')
    expect(slow.gets).toBe(3)
    // b was the least recently used, so it went to make room; a is still kept.
    await cache.get('product-images/a.webp')
    expect(slow.gets).toBe(3)
    await cache.get('product-images/b.webp')
    expect(slow.gets).toBe(4)
  })

  it('forgets that a name was missing once that photo is uploaded, even one too large to keep', async () => {
    const slow = new SlowStore()
    const cache = cachingImageStore(slow, { maxBytes: 10, maxMissing: 10 })
    expect(await cache.get('product-images/big.webp')).toBeNull()
    await cache.put('product-images/big.webp', Buffer.alloc(40), 'image/webp')
    expect((await cache.get('product-images/big.webp'))?.body.byteLength).toBe(40)
  })

  it('remembers only so many missing names', async () => {
    const slow = new SlowStore()
    const cache = cachingImageStore(slow, { maxBytes: 100, maxMissing: 2 })
    for (const name of ['x', 'y', 'z']) await cache.get(`product-images/${name}.webp`)
    await cache.get('product-images/x.webp')
    expect(slow.gets).toBe(4)
  })

  it('never keeps customers’ files', async () => {
    const slow = new SlowStore(new Map([['request-files/abc', image(10)]]))
    const cache = cachingImageStore(slow)
    await cache.get('request-files/abc')
    await cache.get('request-files/abc')
    expect(slow.gets).toBe(2)
  })
})

describe('how often one address can read', () => {
  it('limits the catalogue, the site’s text, the form options, and the health check together', async () => {
    const app = testApp({ publicReadRateLimit: { windowMs: 60_000, limit: 4 } })
    for (const path of ['/api/products', '/api/content/faq', '/api/contact-requests/options', '/api/health']) expect((await request(app).get(path)).status).toBe(200)
    const refused = await request(app).get('/api/products')
    expect(refused.status).toBe(429)
    // Forms and staff screens have their own budgets.
    expect((await request(app).post('/api/admin/session').set('Origin', ORIGIN).send({ email: TEST_ADMIN.email, password: 'wrong password here' })).status).toBe(401)
  })

  it('limits product photos on their own budget', async () => {
    const app = testApp({ imageReadRateLimit: { windowMs: 60_000, limit: 2 } }, null, undefined, new MemoryImageStore())
    const name = `${'a'.repeat(64)}.webp`
    expect((await request(app).get(`/api/product-images/${name}`)).status).toBe(404)
    expect((await request(app).get(`/api/product-images/${name}`)).status).toBe(404)
    expect((await request(app).get(`/api/product-images/${name}`)).status).toBe(429)
    expect((await request(app).get('/api/products')).status).toBe(200)
  })

  it('is generous in production, far above what a visitor uses', () => {
    const production = loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://example.test/gpec', CLIENT_ORIGIN: 'https://gpecengineering.com' })
    expect(production.publicReadRateLimit).toEqual({ windowMs: 15 * 60_000, limit: 1000 })
    expect(production.imageReadRateLimit).toEqual({ windowMs: 15 * 60_000, limit: 3000 })
  })
})
