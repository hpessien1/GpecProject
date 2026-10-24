import { Router } from 'express'
import { NotFoundError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { adminRequests } from '../services/adminRequests.js'
import type { ImageStore } from '../services/imageStore.js'
import { REQUEST_FILE_ID_PATTERN, requestFileKey } from '../services/requestFiles.js'
import { REFERENCE_PATTERNS, validateNote, validateRequestListQuery, validateStatusChange } from '../validation/adminRequest.js'
import { validateOlderPageQuery } from '../validation/olderPage.js'

// Contact requests (/api/admin/contact-requests) for GPEC staff. Mounted behind requireAdmin in
// app.ts: customers' personal details never reach an anonymous visitor. Admins can read and search
// requests, open the files customers attached, change their status, and add internal notes; they
// cannot edit or delete requests or notes. store: where attached files are kept (null: not set up).
export default function adminRequestsRouter(kind: keyof typeof adminRequests, store: ImageStore | null) {
  const router = Router()
  const service = adminRequests[kind]

  function referenceParam(reference: string | undefined) {
    if (!reference || !REFERENCE_PATTERNS[kind].test(reference)) throw new NotFoundError('Request not found.')
    return reference
  }

  router.get('/', async (req, res, next) => {
    try {
      const { errors, value } = validateRequestListQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await service.list(value.page, value.status, value.search))
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:reference', async (req, res, next) => {
    try {
      return res.json(await service.get(referenceParam(req.params.reference)))
    } catch (error) {
      return next(error)
    }
  })

  // Older pages of a request's history and notes (the newest come with the request).
  for (const path of ['history', 'notes'] as const) {
    router.get(`/:reference/${path}`, async (req, res, next) => {
      try {
        const reference = referenceParam(req.params.reference)
        const { errors, value } = validateOlderPageQuery(req.query)
        if (Object.keys(errors).length > 0) throw new ValidationError(errors)
        return res.json(await service[path](reference, value.before))
      } catch (error) {
        return next(error)
      }
    })
  }

  // A photo or document the customer attached, read from the private bucket for a logged-in admin
  // only (the session cookie is sent with the admin panel's <img> and links, which are same-site).
  // Photos may be shown in the panel; PDFs are always downloaded, never opened inside the site, and
  // the sandbox stops anything in a file running as part of the API's origin.
  router.get('/:reference/files/:fileId', async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      if (!store || !REQUEST_FILE_ID_PATTERN.test(req.params.fileId)) throw new NotFoundError('File not found.')
      const file = await service.attachment(reference, req.params.fileId)
      const stored = await store.get(requestFileKey(file.id))
      if (!stored) throw new NotFoundError('File not found.')
      res.set({
        'Content-Type': file.contentType,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        // helmet allows same-origin use only; the admin panel is on the site, another origin of the same site.
        'Cross-Origin-Resource-Policy': 'same-site',
      })
      if (file.contentType === 'application/pdf') res.attachment(file.name)
      return res.send(Buffer.from(stored.body))
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/:reference', async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      const { errors, value } = validateStatusChange(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await service.setStatus(currentAdmin(res), reference, value.status))
    } catch (error) {
      return next(error)
    }
  })

  router.post('/:reference/notes', async (req, res, next) => {
    try {
      const reference = referenceParam(req.params.reference)
      const { errors, value } = validateNote(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.status(201).json(await service.addNote(currentAdmin(res), reference, value.text))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
