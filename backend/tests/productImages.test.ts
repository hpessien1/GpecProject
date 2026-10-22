import request from 'supertest'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { seedSampleProducts } from '../src/services/products.js'
import { MemoryImageStore, createTestAdmin, loggedInAgent, noBreaches, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const ORIGIN = 'http://localhost:5173'

// Real images made on the spot, so every check runs against genuine encoder output.
function photo(width: number, height: number, format: 'jpeg' | 'png' | 'webp' | 'gif' = 'jpeg') {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } }).toFormat(format).toBuffer()
}

let store: MemoryImageStore
let app: ReturnType<typeof testApp>
let agent: Awaited<ReturnType<typeof loggedInAgent>>
beforeEach(async () => {
  store = new MemoryImageStore()
  app = testApp({}, null, noBreaches, store)
  await createTestAdmin()
  agent = await loggedInAgent(app)
})

function upload(body: Buffer | string, type = 'image/jpeg', origin = ORIGIN) {
  return agent.post('/api/admin/product-images').set('Origin', origin).set('Content-Type', type).send(body)
}

describe('uploading a product photo', () => {
  it('shrinks a large photo to fit 1600px and saves it as WebP under its content hash', async () => {
    const res = await upload(await photo(3000, 2000))
    expect(res.status).toBe(201)
    expect(res.body.image).toMatch(/^product-images\/[0-9a-f]{64}\.webp$/)
    const saved = store.objects.get(res.body.image)
    expect(saved?.contentType).toBe('image/webp')
    expect(await sharp(saved?.body).metadata()).toMatchObject({ format: 'webp', width: 1600, height: 1067 })
  })

  it('accepts PNG and WebP, and never enlarges a small photo', async () => {
    for (const format of ['png', 'webp'] as const) {
      const res = await upload(await photo(400, 300, format), `image/${format}`)
      expect(res.status).toBe(201)
      expect(await sharp(store.objects.get(res.body.image)?.body).metadata()).toMatchObject({ format: 'webp', width: 400, height: 300 })
    }
  })

  it('turns a sideways phone photo upright and drops its camera details', async () => {
    const sideways = await sharp(await photo(400, 200))
      .withExif({ IFD0: { Copyright: 'hidden-marker', Make: 'PhoneMaker' } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()
    expect((await sharp(sideways).metadata()).exif).toBeDefined()
    const res = await upload(sideways)
    const saved = await sharp(store.objects.get(res.body.image)?.body).metadata()
    expect(saved).toMatchObject({ width: 200, height: 400 })
    expect(saved.exif).toBeUndefined()
    expect(Buffer.from(store.objects.get(res.body.image)?.body ?? []).includes('hidden-marker')).toBe(false)
  })

  it('gives the same photo the same name', async () => {
    const image = await photo(500, 500)
    expect((await upload(image)).body.image).toBe((await upload(image)).body.image)
    expect(store.objects.size).toBe(1)
  })

  it.each([
    ['a text file named as a JPEG', () => Promise.resolve(Buffer.from('not really a photo')), 'image/jpeg'],
    ['a GIF declared as PNG', () => photo(50, 50, 'gif'), 'image/png'],
    ['a truncated JPEG', async () => (await photo(800, 600)).subarray(0, 300), 'image/jpeg'],
    ['a photo declared with another type', () => photo(50, 50), 'application/pdf'],
    ['an empty body', () => Promise.resolve(Buffer.alloc(0)), 'image/jpeg'],
  ])('refuses %s and stores nothing', async (_label, makeBody, type) => {
    const res = await upload(await makeBody(), type)
    expect(res.status).toBe(400)
    expect(res.body.errors.image).toContain('Choose a JPEG, PNG, or WebP photo.')
    expect(store.objects.size).toBe(0)
  })

  it('refuses a file over 10 MB with 413 and stores nothing', async () => {
    const res = await upload(Buffer.alloc(10 * 1024 * 1024 + 1))
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE')
    expect(store.objects.size).toBe(0)
  })

  it('refuses anonymous visitors and other sites before reading the photo', async () => {
    const image = await photo(100, 100)
    expect((await request(app).post('/api/admin/product-images').set('Origin', ORIGIN).set('Content-Type', 'image/jpeg').send(image)).status).toBe(401)
    expect((await upload(image, 'image/jpeg', 'https://attacker.example')).status).toBe(403)
    expect(store.objects.size).toBe(0)
  })

  it('answers 503 when uploads are not set up', async () => {
    const offApp = testApp()
    const offAgent = await loggedInAgent(offApp)
    const res = await offAgent.post('/api/admin/product-images').set('Origin', ORIGIN).set('Content-Type', 'image/jpeg').send(await photo(100, 100))
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('IMAGE_UPLOADS_OFF')
  })

  it('tells the admin screens whether uploads are on', async () => {
    expect((await agent.get('/api/admin/session')).body.imageUploads).toBe(true)
    expect((await (await loggedInAgent(testApp())).get('/api/admin/session')).body.imageUploads).toBe(false)
  })
})

describe('serving uploaded photos', () => {
  it('serves a photo to anyone, cached for good and usable from the site\'s origin', async () => {
    const { image } = (await upload(await photo(300, 200))).body
    const res = await request(app).get(`/api/${image}`)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(Buffer.from(res.body).equals(Buffer.from(store.objects.get(image)?.body ?? []))).toBe(true)
  })

  it.each([
    `product-images/${'a'.repeat(64)}.webp`,
    'product-images/not-a-hash.webp',
    'product-images/..%2F..%2Fsecret',
  ])('answers 404 for %s', async (path) => {
    expect((await request(app).get(`/api/${path}`)).status).toBe(404)
  })

  it('answers 404 when uploads are not set up', async () => {
    expect((await request(testApp()).get(`/api/product-images/${'a'.repeat(64)}.webp`)).status).toBe(404)
  })
})

describe('using an uploaded photo on a product', () => {
  beforeEach(() => seedSampleProducts())

  function setImage(image: string) {
    return agent.patch('/api/admin/products/panel-001').set('Origin', ORIGIN).send({ image })
  }

  it('saves the uploaded photo and records the change', async () => {
    const { image } = (await upload(await photo(300, 200))).body
    const res = await setImage(image)
    expect(res.status).toBe(200)
    expect(res.body.product.image).toBe(image)
    const history = (await agent.get('/api/admin/products/panel-001/history')).body.history
    expect(history[0].changes).toEqual([{ field: 'image', from: '/assets/electrical-panels-product.png', to: image }])
    const shop = await request(app).get('/api/products')
    expect(shop.body.products.find((product: { id: string }) => product.id === 'panel-001').image).toBe(image)
  })

  it.each([
    'https://attacker.example/photo.webp',
    'product-images/short.webp',
    `product-images/${'a'.repeat(64)}.png`,
    '../product-images/x.webp',
  ])('refuses %s as an image', async (image) => {
    const res = await setImage(image)
    expect(res.status).toBe(400)
    expect(res.body.errors.image).toContain('uploaded photo or a file in /assets/')
  })
})

describe('request bodies that are too large', () => {
  it('answers 413, not a server error, for an oversized JSON body', async () => {
    const res = await request(app).post('/api/contact-requests').set('Content-Type', 'application/json').send(JSON.stringify({ message: 'x'.repeat(40_000) }))
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE')
  })
})
