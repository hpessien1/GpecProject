import sharp from 'sharp'

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp'])
// Large enough for any phone camera; stops a small file that claims enormous dimensions from using up
// the server's memory.
const MAX_INPUT_PIXELS = 50_000_000

// Opening a large photo takes a lot of memory for a moment (up to about 200 MB at MAX_INPUT_PIXELS), so
// the API opens one at a time, however many arrive together (audit M-04). Each waits for the one
// before it to finish, whether that one worked or not.
let queue: Promise<unknown> = Promise.resolve()

// Opens a file as a photo and saves it afresh as WebP, turned upright and fitted inside maxDimension.
// null when it is not a JPEG, PNG, or WebP that can be read, whatever its name or declared type.
// Re-encoding leaves behind anything hidden in the original, including camera details such as GPS
// location, which sharp drops unless asked to keep them. Used for product photos and for photos
// customers attach to contact requests.
export function reencodePhoto(input: Buffer, maxDimension: number) {
  const result = queue.then(() => reencode(input, maxDimension))
  queue = result.catch(() => undefined)
  return result
}

async function reencode(input: Buffer, maxDimension: number) {
  try {
    const image = sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    const { format } = await image.metadata()
    if (!format || !ACCEPTED_FORMATS.has(format)) return null
    return await image
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    // Anything sharp cannot read (a renamed document, a damaged or truncated file).
    return null
  }
}
