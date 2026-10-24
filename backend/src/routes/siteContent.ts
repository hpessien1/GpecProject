import { Router } from 'express'
import { NotFoundError } from '../errors.js'
import { getSiteContent } from '../services/siteContent.js'
import { isSiteContentKey } from '../validation/siteContent.js'

// Public text of the privacy notice, the refunds policy, and the FAQ (/api/content/<page>), as GPEC's
// staff last saved it. The only input is the page name, checked against the known pages.
export default function siteContentRouter() {
  const router = Router()

  router.get('/:key', async (req, res, next) => {
    try {
      if (!isSiteContentKey(req.params.key)) throw new NotFoundError('Page not found.')
      return res.json(await getSiteContent(req.params.key))
    } catch (error) {
      return next(error)
    }
  })

  return router
}
