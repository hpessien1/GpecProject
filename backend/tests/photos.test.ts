import { describe, expect, it, vi } from 'vitest'

// Counts how many photos sharp is working on at once: from reading a photo (metadata) until its new
// copy is made (toBuffer). Images the test makes itself are not counted.
const work = vi.hoisted(() => ({ active: 0, most: 0 }))

vi.mock('sharp', async (importOriginal) => {
  const real = (await importOriginal<typeof import('sharp')>()).default
  const counted = (...args: Parameters<typeof real>) => {
    const image = real(...args)
    const metadata = image.metadata.bind(image)
    const toBuffer = image.toBuffer.bind(image)
    let isCounted = false
    image.metadata = (async () => {
      isCounted = true
      work.active++
      work.most = Math.max(work.most, work.active)
      return await metadata()
    }) as typeof image.metadata
    image.toBuffer = (async () => {
      try {
        return await toBuffer()
      } finally {
        if (isCounted) work.active--
      }
    }) as typeof image.toBuffer
    return image
  }
  return { default: Object.assign(counted, real) }
})

const { default: sharp } = await import('sharp')
const { reencodePhoto } = await import('../src/services/photos.js')

// Audit M-04: opening a large photo takes a lot of memory for a moment, so the API opens one at a time,
// however many arrive together (contact-form attachments and product photos).
describe('re-saving photos', () => {
  it('works on one photo at a time, and still re-saves every one', async () => {
    const photos = await Promise.all([1, 2, 3, 4].map((n) => sharp({ create: { width: 1200 + n, height: 900, channels: 3, background: { r: 30, g: 90, b: 200 } } }).jpeg().toBuffer()))
    work.most = 0
    const results = await Promise.all(photos.map((photo) => reencodePhoto(photo, 800)))
    expect(results.every((result) => result !== null && result.length > 0)).toBe(true)
    expect(work.most).toBe(1)
  })

  it('carries on with the next photo after one that cannot be read', async () => {
    const good = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer()
    const results = await Promise.all([reencodePhoto(Buffer.from('not a photo'), 800), reencodePhoto(good, 800)])
    expect(results[0]).toBeNull()
    expect(results[1]).not.toBeNull()
  })
})
