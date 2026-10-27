import { Router } from 'express'
import { currencyInfo } from '../services/currency.js'
import { productChanges } from '../models/Product.js'
import { listActiveProducts } from '../services/products.js'
import { shortLived } from '../utils/freshness.js'

// How long one read of the catalogue serves every request, unless a product changes first.
const CATALOGUE_TTL_MS = 30_000

// Public catalogue. Takes no input, so there is nothing to validate. Prices and the currency they are
// in are included once the CURRENCY setting is configured; until then currency is null and products
// carry no price.
export default function productsRouter(currency: string | null) {
  const router = Router()
  // One database read shared by every visitor (audit M-08); read again as soon as a product changes.
  const catalogue = shortLived(() => listActiveProducts(currency), CATALOGUE_TTL_MS, productChanges)

  router.get('/', async (_req, res, next) => {
    try {
      return res.json({ products: await catalogue(), currency: currencyInfo(currency) })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
