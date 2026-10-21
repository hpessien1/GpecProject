import { Router } from 'express'
import { listActiveProducts } from '../services/products.js'

const router = Router()

// Public catalogue. Takes no input, so there is nothing to validate.
router.get('/', async (_req, res, next) => {
  try {
    return res.json({ products: await listActiveProducts() })
  } catch (error) {
    return next(error)
  }
})

export default router
