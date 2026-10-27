import type { ImageStore, StoredImage } from './imageStore.js'

// Product photos kept in memory (audit M-08). Browsers keep each photo for a year, but a script can
// ask the API for the same photo, or for made-up names, over and over, and every request used to
// reach Amazon S3, which charges per request and per megabyte sent. A photo's name is the hash of its
// content (services/productImages.ts), so a kept copy never goes out of date.

const PRODUCT_IMAGES = 'product-images/'
// Plenty for GPEC's catalogue (a few hundred kB a photo), bounded so memory use stays predictable.
const DEFAULT_LIMITS = { maxBytes: 50 * 1024 * 1024, maxMissing: 1000 }
// Names found not to exist are remembered this long, unless that photo is uploaded first.
const MISSING_TTL_MS = 10 * 60_000
// Reads from the bucket in flight at once; the rest wait their turn.
const MAX_BUCKET_READS = 4

export interface ImageCacheLimits {
  maxBytes: number
  maxMissing: number
}

// Wraps the bucket: product photos are kept (least recently used dropped first beyond maxBytes),
// names that do not exist are remembered (at most maxMissing, oldest dropped first), requests for a
// photo already being fetched share that fetch, and at most MAX_BUCKET_READS reads run at once.
// Customers' files (request-files/) pass straight through and are never kept.
export function cachingImageStore(store: ImageStore, limits: ImageCacheLimits = DEFAULT_LIMITS): ImageStore {
  // Map order is the order of last use: the first entry is the least recently used.
  const kept = new Map<string, StoredImage>()
  let keptBytes = 0
  const missing = new Map<string, number>()
  const fetching = new Map<string, Promise<StoredImage | null>>()
  let reading = 0
  const waiting: (() => void)[] = []

  function keep(key: string, image: StoredImage) {
    missing.delete(key)
    if (image.body.byteLength > limits.maxBytes) return
    const earlier = kept.get(key)
    if (earlier) keptBytes -= earlier.body.byteLength
    kept.delete(key)
    kept.set(key, image)
    keptBytes += image.body.byteLength
    for (const [oldest, oldImage] of kept) {
      if (keptBytes <= limits.maxBytes) break
      kept.delete(oldest)
      keptBytes -= oldImage.body.byteLength
    }
  }

  function rememberMissing(key: string) {
    missing.delete(key)
    missing.set(key, Date.now() + MISSING_TTL_MS)
    for (const oldest of missing.keys()) {
      if (missing.size <= limits.maxMissing) break
      missing.delete(oldest)
    }
  }

  // A finished read hands its place straight to the next in line, so a newcomer cannot slip past.
  async function readFromBucket(key: string) {
    if (reading >= MAX_BUCKET_READS) await new Promise<void>((resolve) => waiting.push(resolve))
    else reading++
    try {
      return await store.get(key)
    } finally {
      const next = waiting.shift()
      if (next) next()
      else reading--
    }
  }

  return {
    async put(key, body, contentType) {
      await store.put(key, body, contentType)
      if (key.startsWith(PRODUCT_IMAGES)) keep(key, { body: new Uint8Array(body), contentType })
    },
    get(key) {
      if (!key.startsWith(PRODUCT_IMAGES)) return store.get(key)
      const image = kept.get(key)
      if (image) {
        // Moved to the end: most recently used.
        kept.delete(key)
        kept.set(key, image)
        return Promise.resolve(image)
      }
      const missingUntil = missing.get(key)
      if (missingUntil !== undefined && missingUntil > Date.now()) return Promise.resolve(null)
      const pending = fetching.get(key)
      if (pending) return pending
      const fetched = readFromBucket(key)
        .then((found) => {
          if (found) keep(key, found)
          else rememberMissing(key)
          return found
        })
        .finally(() => fetching.delete(key))
      fetching.set(key, fetched)
      return fetched
    },
  }
}
