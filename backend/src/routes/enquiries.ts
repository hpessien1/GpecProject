import { Router } from 'express'
import Enquiry from '../models/Enquiry.js'
import { findActiveProducts } from '../services/products.js'
import { createReference } from '../utils/reference.js'
import { UNAVAILABLE_PRODUCTS, validateEnquiry } from '../validation/enquiry.js'
import { isLikelySpam } from '../validation/fields.js'

const router = Router()

router.post('/', async (req, res, next) => {
  // Looks like success to the sender, so a script gets no hint to try something else; nothing is saved.
  if (isLikelySpam(req.body)) {
    console.info('Discarded a likely spam order enquiry (spam trap field filled in).')
    return res.status(201).json({ reference: createReference(), createdAt: new Date() })
  }
  const { errors, value } = validateEnquiry(req.body)
  if (Object.keys(errors).length > 0) return res.status(400).json({ message: 'Check enquiry details and try again.', errors })

  try {
    // Names and references come from the database; unknown or archived products are refused.
    const products = await findActiveProducts(value.items.map((item) => item.productId))
    const items = value.items.flatMap(({ productId, quantity }) => {
      const product = products.get(productId)
      return product ? [{ productId, name: product.name, reference: product.reference, quantity }] : []
    })
    if (items.length !== value.items.length) {
      return res.status(400).json({ message: 'Check enquiry details and try again.', errors: { items: UNAVAILABLE_PRODUCTS } })
    }
    const enquiry = await Enquiry.create({ ...value, items, reference: createReference() })
    return res.status(201).json({ reference: enquiry.reference, createdAt: enquiry.createdAt })
  } catch (error) {
    return next(error)
  }
})

export default router
