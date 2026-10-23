import { Router } from 'express'
import { HttpError, NotFoundError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { createProduct, getProductForAdmin, listProductsForAdmin, productHistory, updateProduct } from '../services/adminProducts.js'
import { PRODUCT_ID_PATTERN, validateProductCreate, validateProductUpdate } from '../validation/adminProduct.js'
import type { ProductChanges } from '../validation/adminProduct.js'
import { pageNumber } from '../validation/fields.js'
import type { ValidationErrors } from '../validation/fields.js'
import { validateOlderPageQuery } from '../validation/olderPage.js'
import type { AppConfig } from '../app.js'

// Mounted behind requireAdmin in app.ts. There is no delete: products are archived (status), because
// orders will refer to them.
export default function adminProductsRouter(config: AppConfig) {
  const router = Router()

  // A price means nothing without a currency, so prices stay empty until GPEC confirms one.
  function refusePriceWithoutCurrency(changes: ProductChanges) {
    if (!config.currency && changes.price !== undefined && changes.price !== null) {
      throw new HttpError(409, 'Prices cannot be set until the shop currency is configured.', 'CURRENCY_NOT_CONFIGURED')
    }
  }

  function productIdParam(id: string | undefined) {
    if (!id || !PRODUCT_ID_PATTERN.test(id)) throw new NotFoundError('Product not found.')
    return id
  }

  router.get('/', async (req, res, next) => {
    try {
      const errors: ValidationErrors = {}
      const page = pageNumber(req.query.page, errors)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await listProductsForAdmin(page))
    } catch (error) {
      return next(error)
    }
  })

  router.post('/', async (req, res, next) => {
    try {
      const { errors, value } = validateProductCreate(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      refusePriceWithoutCurrency(value)
      return res.status(201).json({ product: await createProduct(currentAdmin(res), value) })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      return res.json({ product: await getProductForAdmin(productIdParam(req.params.id)) })
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/:id', async (req, res, next) => {
    try {
      const id = productIdParam(req.params.id)
      const { errors, value } = validateProductUpdate(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      refusePriceWithoutCurrency(value)
      return res.json({ product: await updateProduct(currentAdmin(res), id, value) })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:id/history', async (req, res, next) => {
    try {
      const id = productIdParam(req.params.id)
      const { errors, value } = validateOlderPageQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await productHistory(id, value.before))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
