import { Router } from 'express'
import { NotFoundError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { adminRequests } from '../services/adminRequests.js'
import { REFERENCE_PATTERNS, validateRequestListQuery, validateStatusChange } from '../validation/adminRequest.js'

// Order enquiries (/api/admin/enquiries) and contact requests (/api/admin/contact-requests) for GPEC
// staff. Mounted behind requireAdmin in app.ts: customers' personal details never reach an anonymous
// visitor. Admins can read requests and change their status; they cannot edit or delete them.
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
      return res.json(await service.list(value.page, value.status))
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

  return router
}
