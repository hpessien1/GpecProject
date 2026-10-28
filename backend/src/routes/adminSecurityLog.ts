import { Router } from 'express'
import { ValidationError } from '../errors.js'
import { securityLogPage } from '../services/securityLog.js'
import { validateSecurityLogQuery } from '../validation/securityLog.js'

// The security log (/api/admin/security-log, audit M-06), behind requireAdmin in app.ts: read only.
// Nothing on the site changes or deletes an entry; MongoDB removes them after 12 months. When GPEC
// adds roles with fewer permissions, this stays with the full admin role.
export default function adminSecurityLogRouter() {
  const router = Router()

  router.get('/', async (req, res, next) => {
    try {
      const { errors, value } = validateSecurityLogQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await securityLogPage(value))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
