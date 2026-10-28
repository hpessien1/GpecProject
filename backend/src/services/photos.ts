import sharp from 'sharp'
import { oneAtATime } from './heavyWork.js'

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp'])
// Large enough for any phone camera; stops a small file that claims enormous dimensions from using up
// the server's memory (up to about 200 MB while it is opened).
const MAX_INPUT_PIXELS = 50_000_000

// Opens a file as a photo and saves it afresh as WebP, turned upright and fitted inside maxDimension.
// null when it is not a JPEG, PNG, or WebP that can be read, whatever its name or declared type.
// Re-encoding leaves behind anything hidden in the original, including camera details such as GPS
// location, which sharp drops unless asked to keep them. Used for product photos and for photos
// customers attach to contact requests. One at a time across the API, with PDFs (services/heavyWork.ts).
export function reencodePhoto(input: Buffer, maxDimension: number) {
  return oneAtATime(() => reencode(input, maxDimension))
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
