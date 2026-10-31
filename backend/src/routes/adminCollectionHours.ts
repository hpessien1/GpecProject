import { Router } from 'express'
import { ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { collectionHoursHistory, getCollectionHours, updateCollectionHours } from '../services/collectionHours.js'
import { validateCollectionHoursUpdate } from '../validation/collectionHours.js'
import { validateOlderPageQuery } from '../validation/olderPage.js'

// Collection hours for pickup orders (/api/admin/collection-hours), behind requireAdmin in app.ts.
export default function adminCollectionHoursRouter() {
  const router = Router()

  router.get('/', async (_req, res, next) => {
    try {
      const [hours, history] = await Promise.all([getCollectionHours(), collectionHoursHistory(null)])
      return res.json({ hours, ...history })
    } catch (error) {
      return next(error)
    }
  })

  // Older pages of the change history (the newest comes with the hours).
  router.get('/history', async (req, res, next) => {
    try {
      const { errors, value } = validateOlderPageQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await collectionHoursHistory(value.before))
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/', async (req, res, next) => {
    try {
      const { errors, value } = validateCollectionHoursUpdate(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const hours = await updateCollectionHours(currentAdmin(res), value.hours)
      return res.json({ hours, ...await collectionHoursHistory(null) })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
