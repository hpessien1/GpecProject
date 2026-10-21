import { Router } from 'express'
import ContactRequest from '../models/ContactRequest.js'
import type { Notifier } from '../services/notifications.js'
import { createReference } from '../utils/reference.js'
import { validateContactRequest } from '../validation/contactRequest.js'
import { isLikelySpam } from '../validation/fields.js'

export default function contactRequestsRouter(notifier: Notifier) {
  const router = Router()

  router.post('/', async (req, res, next) => {
    // Looks like success to the sender, so a script gets no hint to try something else; nothing is
    // saved and no email is sent.
    if (isLikelySpam(req.body)) {
      console.info('Discarded a likely spam contact request (spam trap field filled in).')
      return res.status(201).json({ reference: createReference('GPEC-C'), createdAt: new Date() })
    }
    const { errors, value } = validateContactRequest(req.body)
    if (Object.keys(errors).length > 0) return res.status(400).json({ message: 'Check your details and try again.', errors })

    try {
      const contactRequest = await ContactRequest.create({ ...value, reference: createReference('GPEC-C') })
      res.status(201).json({ reference: contactRequest.reference, createdAt: contactRequest.createdAt })
      // After answering, so email never delays or breaks the customer's request (the notifier never throws).
      void notifier.contactRequestReceived({ ...value, reference: contactRequest.reference, createdAt: contactRequest.createdAt })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
