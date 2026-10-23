import { Router } from 'express'
import { currencyInfo } from '../services/currency.js'
import { listActiveProducts } from '../services/products.js'

// Public catalogue. Takes no input, so there is nothing to validate. Prices and the currency they are
// in are included once the CURRENCY setting is configured; until then currency is null and products
// carry no price.
export default function productsRouter(currency: string | null) {
  const router = Router()

  router.get('/', async (_req, res, next) => {
    try {
      return res.json({ products: await listActiveProducts(currency), currency: currencyInfo(currency) })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
