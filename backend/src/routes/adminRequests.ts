import { Router } from 'express'
import { NotFoundError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { adminRequests } from '../services/adminRequests.js'
import { REFERENCE_PATTERNS, validateNote, validateRequestListQuery, validateStatusChange } from '../validation/adminRequest.js'

// Contact requests (/api/admin/contact-requests) for GPEC staff. Mounted behind requireAdmin in
// app.ts: customers' personal details never reach an anonymous visitor. Admins can read and search
// requests, change their status, and add internal notes; they cannot edit or delete requests or notes.
export default function adminRequestsRouter(kind: keyof typeof adminRequests) {
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
