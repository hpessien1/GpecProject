import { createHash } from 'node:crypto'
import { ValidationError } from '../errors.js'
import type { ImageStore } from './imageStore.js'
import { reencodePhoto } from './photos.js'

// Photos staff choose on their laptop or phone. The browser sends the file as it is; the server never
// stores it as received. It is opened as an image (anything that is not a real JPEG, PNG, or WebP is
// refused, whatever its name or declared type), turned upright, shrunk to fit the shop, and saved
// afresh as WebP, without camera details such as GPS location (services/photos.ts).
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
// The shop shows photos at most about 800px wide; 1600px stays sharp on high-density screens.
const MAX_DIMENSION = 1600

// A stored photo's name: product-images/<SHA-256 of the saved file>.webp. The same photo uploaded
// twice gets the same name, and a name never points to different content, so browsers may cache it
// for good. This is also the value saved in a product's `image` field.
export const PRODUCT_IMAGE_KEY_PATTERN = /^product-images\/[0-9a-f]{64}\.webp$/

const NOT_AN_IMAGE = 'Choose a JPEG, PNG, or WebP photo.'

export async function saveProductImage(store: ImageStore, input: Buffer) {
  const output = await reencodePhoto(input, MAX_DIMENSION)
  if (!output) throw new ValidationError({ image: NOT_AN_IMAGE }, `${NOT_AN_IMAGE} This file could not be read as one.`)
  const key = `product-images/${createHash('sha256').update(output).digest('hex')}.webp`
  await store.put(key, output, 'image/webp')
  return key
}
