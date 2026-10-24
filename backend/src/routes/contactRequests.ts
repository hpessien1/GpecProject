import { Router } from 'express'
import type { RequestHandler } from 'express'
import multer from 'multer'
import { HttpError } from '../errors.js'
import ContactRequest from '../models/ContactRequest.js'
import type { ImageStore } from '../services/imageStore.js'
import type { Notifier } from '../services/notifications.js'
import { MAX_REQUEST_FILE_BYTES, MAX_REQUEST_FILES, prepareRequestFiles, storeRequestFiles } from '../services/requestFiles.js'
import { createReference } from '../utils/reference.js'
import { validateContactRequest } from '../validation/contactRequest.js'
import { isLikelySpam } from '../validation/fields.js'

const FILES_FIELD = 'files'

// The form arrives as JSON, or, when the customer attached files, as multipart form data: the same
// text fields plus up to five files in `files`, each held in memory (at most 10 MB) until checked.
// fieldSize fits the 5,000-character message in any script (up to 4 bytes a character).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_REQUEST_FILES, fileSize: MAX_REQUEST_FILE_BYTES, fields: 12, fieldSize: 20_000, parts: 12 + MAX_REQUEST_FILES },
  // Browsers send file names as UTF-8; multer would otherwise read them as Latin-1.
  defParamCharset: 'utf8',
}).array(FILES_FIELD, MAX_REQUEST_FILES)

// multer's refusals become the customer's mistake (4xx) with a message they can act on, never a 500.
const receiveFiles: RequestHandler = (req, res, next) => {
  upload(req, res, (error: unknown) => {
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
// limiter: the form's per-IP budget, checked before any upload is read.
export default function contactRequestsRouter(notifier: Notifier, imageStore: ImageStore | null, limiter: RequestHandler) {
  const router = Router()

  // Whether the form offers file attachments. Read on every visit to the home page, so it is outside
  // the form's budget.
  router.get('/options', (_req, res) => {
    res.json({ fileUploads: imageStore !== null })
  })

  router.post('/', limiter, receiveFiles, async (req, res, next) => {
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
      if (files.length > 0 && !imageStore) throw new HttpError(503, 'Files cannot be attached at the moment. Send your request without them, or email them to GPEC.', 'FILE_UPLOADS_OFF')
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
