import { Router } from 'express'
import type { AppConfig } from '../app.js'
import { HttpError, NotFoundError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { createDeliveryArea, deliveryAreaHistory, getDeliveryAreaForAdmin, listDeliveryAreasForAdmin, updateDeliveryArea } from '../services/deliveryAreas.js'
import { isDeliveryAreaId, validateDeliveryAreaCreate, validateDeliveryAreaUpdate } from '../validation/deliveryArea.js'
import { pageNumber } from '../validation/fields.js'
import type { ValidationErrors } from '../validation/fields.js'
import { validateOlderPageQuery } from '../validation/olderPage.js'

// Delivery areas and their fees (/api/admin/delivery-areas), behind requireAdmin in app.ts. No delete:
// areas are archived, and past orders keep their own copy of the area and fee.
export default function adminDeliveryAreasRouter(config: AppConfig) {
  const router = Router()

  // A fee means nothing without a currency, as for product prices.
  function requireCurrency() {
    if (!config.currency) throw new HttpError(409, 'Delivery fees cannot be set until the shop currency is configured.', 'CURRENCY_NOT_CONFIGURED')
  }

  function idParam(id: string | undefined) {
    if (!isDeliveryAreaId(id)) throw new NotFoundError('Delivery area not found.')
    return id
  }

  router.get('/', async (req, res, next) => {
    try {
      const errors: ValidationErrors = {}
      const page = pageNumber(req.query.page, errors)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await listDeliveryAreasForAdmin(page))
    } catch (error) {
      return next(error)
    }
  })

  router.post('/', async (req, res, next) => {
    try {
      const { errors, value } = validateDeliveryAreaCreate(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      requireCurrency()
      return res.status(201).json({ area: await createDeliveryArea(currentAdmin(res), value) })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      return res.json({ area: await getDeliveryAreaForAdmin(idParam(req.params.id)) })
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/:id', async (req, res, next) => {
    try {
      const id = idParam(req.params.id)
      const { errors, value } = validateDeliveryAreaUpdate(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      if (value.fee !== undefined) requireCurrency()
      return res.json({ area: await updateDeliveryArea(currentAdmin(res), id, value) })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:id/history', async (req, res, next) => {
    try {
      const id = idParam(req.params.id)
      const { errors, value } = validateOlderPageQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await deliveryAreaHistory(id, value.before))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
