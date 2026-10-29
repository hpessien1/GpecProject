import { randomBytes } from 'node:crypto'
import { ValidationError } from '../errors.js'
import type { ImageStore } from './imageStore.js'
import { cleanPdf } from './pdfs.js'
import type { PdfRefusal, RemovedPdfPart } from './pdfs.js'
import { reencodePhoto } from './photos.js'

// Photos and drawings a customer may attach to a contact request (optional): JPEG, PNG, or WebP
// photos, and PDF documents. They are seen only by staff, through the admin panel; the bucket is
// private (services/imageStore.ts). Nothing is stored as received: photos are re-saved as WebP, which
// drops hidden details such as where they were taken (services/photos.ts), and PDFs are rebuilt from
// their pages without scripts, actions, attached files, forms, or media (services/pdfs.ts). The admin
// panel still always downloads PDFs rather than opening them inside the site.
export const REQUEST_FILE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const MAX_REQUEST_FILES = 5
export const MAX_REQUEST_FILE_BYTES = 10 * 1024 * 1024
// All the files on one form together (audit M-04: the server holds them in memory while checking them).
export const MAX_REQUEST_FILES_TOTAL_BYTES = 25 * 1024 * 1024
// What is stored, and so what the admin panel is sent.
export const STORED_REQUEST_FILE_TYPES = ['image/webp', 'application/pdf'] as const
export type StoredRequestFileType = typeof STORED_REQUEST_FILE_TYPES[number]
// Nameplates and labels must stay legible, so these keep more detail than the shop's photos.
const MAX_PHOTO_DIMENSION = 2400
const MAX_NAME_LENGTH = 120

// Random, so a file's address says nothing about its content or the request.
export const REQUEST_FILE_ID_PATTERN = /^[0-9a-f]{32}$/
export const requestFileKey = (id: string) => `request-files/${id}`

export const NOT_ACCEPTED_FILE = 'Attach JPEG, PNG, or WebP photos, or PDF documents.'

export interface ReceivedFile {
  originalname: string
  buffer: Buffer
}

export interface PreparedRequestFile {
  id: string
  name: string
  contentType: StoredRequestFileType
  size: number
  body: Buffer
  // What rebuilding a PDF took out (none for photos), for the security log.
  removed: RemovedPdfPart[]
}

// A PDF refused when rebuilt (services/pdfs.ts): the request is refused, naming the file, and the
// route records it in the security log.
export class RefusedPdfError extends ValidationError {
  constructor(readonly reason: PdfRefusal, message: string) {
    super({ files: message }, message)
  }
}

// Every PDF starts with %PDF-; anything else that starts that way is refused when rebuilt.
const looksLikePdf = (input: Buffer) => input.subarray(0, 5).toString('latin1') === '%PDF-'

// The customer's own file name, without control characters.
// oxlint-disable-next-line no-control-regex -- removing control characters is the point
const cleanName = (original: string) => original.replace(/[\u0000-\u001f\u007f]/g, '').trim()

// The name staff see: shortened, and ending in the stored type's extension (a photo sent as .jpg is
// kept as .webp).
function displayName(original: string, extension: string, fallback: string) {
  const base = cleanName(original).replace(/\.[^.]*$/, '').trim().slice(0, MAX_NAME_LENGTH - extension.length)
  return `${base || fallback}${extension}`
}

// Checks each file and makes the version to store. Refuses the whole request, naming the file, if
// any one is not a readable photo or PDF, so the customer can remove it and send again. signal: stops
// before the next file once the form is abandoned or stopped (throws its reason; audit S3-M02).
export async function prepareRequestFiles(files: ReceivedFile[], signal?: AbortSignal): Promise<PreparedRequestFile[]> {
  const prepared: PreparedRequestFile[] = []
  for (const file of files) {
    signal?.throwIfAborted()
    const id = randomBytes(16).toString('hex')
    const shownName = `“${cleanName(file.originalname).slice(0, MAX_NAME_LENGTH) || 'A file'}”`
    if (looksLikePdf(file.buffer)) {
      const pdf = await cleanPdf(file.buffer, signal)
      if ('refused' in pdf) {
        throw new RefusedPdfError(pdf.refused, pdf.refused === 'password'
          ? `${shownName} needs a password to open, so GPEC cannot check it. Remove the password, or send photos of the pages instead.`
          : `${shownName} could not be read as a PDF. ${NOT_ACCEPTED_FILE}`)
      }
      prepared.push({ id, name: displayName(file.originalname, '.pdf', 'document'), contentType: 'application/pdf', size: pdf.body.length, body: pdf.body, removed: pdf.removed })
      continue
    }
    const photo = await reencodePhoto(file.buffer, MAX_PHOTO_DIMENSION, signal)
    if (!photo) {
      const message = `${shownName} could not be read as a photo or PDF. ${NOT_ACCEPTED_FILE}`
      throw new ValidationError({ files: message }, message)
    }
    prepared.push({ id, name: displayName(file.originalname, '.webp', 'photo'), contentType: 'image/webp', size: photo.length, body: photo, removed: [] })
  }
  return prepared
}

export async function storeRequestFiles(store: ImageStore, files: PreparedRequestFile[]) {
  await Promise.all(files.map((file) => store.put(requestFileKey(file.id), file.body, file.contentType)))
}
