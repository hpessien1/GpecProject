import { Router } from 'express'
import type { RequestHandler } from 'express'
import multer from 'multer'
import { HttpError } from '../errors.js'
import ContactRequest from '../models/ContactRequest.js'
import type { ImageStore } from '../services/imageStore.js'
import type { Notifier } from '../services/notifications.js'
import { MAX_REQUEST_FILE_BYTES, MAX_REQUEST_FILES, MAX_REQUEST_FILES_TOTAL_BYTES, prepareRequestFiles, storeRequestFiles } from '../services/requestFiles.js'
import { createReference } from '../utils/reference.js'
import { validateContactRequest } from '../validation/contactRequest.js'
import { isLikelySpam } from '../validation/fields.js'

const FILES_FIELD = 'files'

// The form arrives as JSON, or, when the customer attached files, as multipart form data: the same
// text fields plus up to five files in `files`, held in memory (at most 10 MB each, 25 MB together)
// until checked.
// fieldSize fits the 5,000-character message in any script (up to 4 bytes a character).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_REQUEST_FILES, fileSize: MAX_REQUEST_FILE_BYTES, fields: 12, fieldSize: 20_000, parts: 12 + MAX_REQUEST_FILES },
  // Browsers send file names as UTF-8; multer would otherwise read them as Latin-1.
  defParamCharset: 'utf8',
}).array(FILES_FIELD, MAX_REQUEST_FILES)

// Room for the text fields and the multipart wrapping, on top of the files (12 fields of up to
// 20,000 bytes, and a few hundred bytes of headers per part).
const MAX_FORM_TEXT_BYTES = 320 * 1024

const FILE_UPLOADS_OFF = 'Files cannot be attached at the moment. Send your request without them, or email them to GPEC.'
const filesTooLarge = () => new HttpError(413, `The files together must be ${MAX_REQUEST_FILES_TOTAL_BYTES / 1024 / 1024} MB or smaller.`, 'FILES_TOO_LARGE')

export interface UploadLimits {
  // Forms with files being received or checked at once, across all senders.
  concurrent: number
  // How long a form with files may take to arrive and be checked.
  timeoutMs: number
}

// Five minutes: 25 MB still arrives on an upload of about 0.7 Mbit/s, as on a slow mobile connection.
export const UPLOAD_LIMITS: UploadLimits = { concurrent: 3, timeoutMs: 5 * 60_000 }

// Audit M-04: forms with files are held in memory while they arrive and are checked, so before any of
// one is read: its stated size must fit (browsers always state it, and Node never reads past it),
// files are refused at once while storage is off, each sender (IP) sends one at a time, and at most
// limits.concurrent are handled at once; a form that takes longer than limits.timeoutMs is stopped.
// A sender is refused before their upload is read; Node then discards the rest as it arrives. Forms
// without files (JSON) pass straight through. In memory, like the rate limits: one API instance.
function uploadGate(imageStore: ImageStore | null, limits: UploadLimits): RequestHandler {
  const senders = new Set<string>()
  return (req, res, next) => {
    if (!req.is('multipart/form-data')) return next()
    const stated = req.get('content-length')
    const length = Number(stated)
    if (!stated || !Number.isSafeInteger(length)) return next(new HttpError(411, 'The request could not be read.', 'LENGTH_REQUIRED'))
    if (!imageStore && length > MAX_FORM_TEXT_BYTES) return next(new HttpError(503, FILE_UPLOADS_OFF, 'FILE_UPLOADS_OFF'))
    if (length > MAX_REQUEST_FILES_TOTAL_BYTES + MAX_FORM_TEXT_BYTES) return next(filesTooLarge())
    const sender = req.ip ?? ''
    if (senders.has(sender)) return next(new HttpError(429, 'Your earlier message with files is still being sent. Wait for it to finish, then try again.', 'UPLOAD_IN_PROGRESS'))
    if (senders.size >= limits.concurrent) {
      res.set('Retry-After', '60')
      return next(new HttpError(503, 'Many people are sending files right now. Please try again in a minute: your message and files are still in the form.', 'UPLOADS_BUSY'))
    }
    senders.add(sender)
    // Answered directly, as the upload may still be arriving; the connection is closed, so nothing
    // more of it is read.
    const timer = setTimeout(() => {
      if (res.headersSent) return
      res.set('Connection', 'close').status(408).json({ message: 'Sending your files took too long. Try again with fewer or smaller files, or on a faster connection.', code: 'UPLOAD_TOO_SLOW' })
    }, limits.timeoutMs)
    // Whether the form was answered, refused, stopped, or abandoned by the sender.
    res.once('close', () => {
      clearTimeout(timer)
      senders.delete(sender)
    })
    return next()
  }
}

// multer's refusals become the customer's mistake (4xx) with a message they can act on, never a 500.
const receiveFiles: RequestHandler = (req, res, next) => {
  upload(req, res, (error: unknown) => {
    // Already answered: the upload took too long (uploadGate).
    if (res.headersSent) return
    if (!error) return next()
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'Each file must be 10 MB or smaller.', 'FILE_TOO_LARGE'))
      if (error.code === 'LIMIT_FILE_COUNT' || (error.code === 'LIMIT_UNEXPECTED_FILE' && error.field === FILES_FIELD)) {
        return next(new HttpError(400, `Attach up to ${MAX_REQUEST_FILES} files.`, 'TOO_MANY_FILES'))
      }
    }
    // Anything else (a file under another name, a broken or cut-off upload).
    return next(new HttpError(400, 'The request could not be read.'))
  })
}

// imageStore: where attached files go; null when storage is not set up, and then no files are taken.
// limiter: the form's per-IP budget, checked before any upload is read. limits: for forms with files.
export default function contactRequestsRouter(notifier: Notifier, imageStore: ImageStore | null, limiter: RequestHandler, limits: UploadLimits = UPLOAD_LIMITS) {
  const router = Router()

  // Whether the form offers file attachments. Read on every visit to the home page, so it is outside
  // the form's budget.
  router.get('/options', (_req, res) => {
    res.json({ fileUploads: imageStore !== null })
  })

  router.post('/', limiter, uploadGate(imageStore, limits), receiveFiles, async (req, res, next) => {
    const files = Array.isArray(req.files) ? req.files : []
    // Looks like success to the sender, so a script gets no hint to try something else; nothing is
    // saved and no email is sent.
    if (isLikelySpam(req.body)) {
      console.info('Discarded a likely spam contact request (spam trap field filled in).')
      return res.status(201).json({ reference: createReference('GPEC-C'), createdAt: new Date() })
    }
    const { errors, value } = validateContactRequest(req.body)
    if (Object.keys(errors).length > 0) return res.status(400).json({ message: 'Check your details and try again.', errors })

    try {
      if (files.length > 0 && !imageStore) throw new HttpError(503, FILE_UPLOADS_OFF, 'FILE_UPLOADS_OFF')
      if (files.reduce((total, file) => total + file.size, 0) > MAX_REQUEST_FILES_TOTAL_BYTES) throw filesTooLarge()
      const prepared = await prepareRequestFiles(files)
      // Stored before the request, so a saved request never lists a file that is not there. If saving
      // the request then fails, its files stay in the bucket unreferenced, like unsaved product photos.
      if (imageStore && prepared.length > 0) await storeRequestFiles(imageStore, prepared)
      const contactRequest = await ContactRequest.create({
        ...value,
        reference: createReference('GPEC-C'),
        attachments: prepared.map(({ id, name, contentType, size }) => ({ id, name, contentType, size })),
      })
      res.status(201).json({ reference: contactRequest.reference, createdAt: contactRequest.createdAt })
      // After answering, so email never delays or breaks the customer's request (the notifier never throws).
      void notifier.contactRequestReceived({ ...value, reference: contactRequest.reference, createdAt: contactRequest.createdAt, files: prepared.length })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
