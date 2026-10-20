import { Router } from 'express'
import Enquiry from '../models/Enquiry.js'
import { createReference } from '../utils/reference.js'
import { validateEnquiry } from '../validation/enquiry.js'

const router = Router()

router.post('/', async (req, res, next) => {
  const { errors, value } = validateEnquiry(req.body)
  if (Object.keys(errors).length > 0) return res.status(400).json({ message: 'Check enquiry details and try again.', errors })

  try {
    const enquiry = await Enquiry.create({ ...value, reference: createReference() })
    return res.status(201).json({ reference: enquiry.reference, createdAt: enquiry.createdAt })
  } catch (error) {
    return next(error)
  }
})

export default router
