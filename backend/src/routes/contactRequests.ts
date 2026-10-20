import { Router } from 'express'
import ContactRequest from '../models/ContactRequest.js'
import { createReference } from '../utils/reference.js'
import { validateContactRequest } from '../validation/contactRequest.js'

const router = Router()

router.post('/', async (req, res, next) => {
  const { errors, value } = validateContactRequest(req.body)
  if (Object.keys(errors).length > 0) return res.status(400).json({ message: 'Check your details and try again.', errors })

  try {
    const contactRequest = await ContactRequest.create({ ...value, reference: createReference('GPEC-C') })
    return res.status(201).json({ reference: contactRequest.reference, createdAt: contactRequest.createdAt })
  } catch (error) {
    return next(error)
  }
})

export default router
