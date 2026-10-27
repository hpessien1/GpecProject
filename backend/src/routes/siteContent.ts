import { Router } from 'express'
import { NotFoundError } from '../errors.js'
import { SITE_CONTENT_KEYS, siteContentChanges } from '../models/SiteContent.js'
import { getSiteContent } from '../services/siteContent.js'
import { shortLived } from '../utils/freshness.js'
import { isSiteContentKey } from '../validation/siteContent.js'

// How long one read of a page serves every request, unless staff save it first.
const PAGE_TTL_MS = 30_000

// Public text of the privacy notice, the refunds policy, and the FAQ (/api/content/<page>), as GPEC's
// staff last saved it. The only input is the page name, checked against the known pages.
export default function siteContentRouter() {
  const router = Router()
  // One database read per page shared by every visitor (audit M-08); read again as soon as staff save.
  const pages = new Map(SITE_CONTENT_KEYS.map((key) => [key, shortLived(() => getSiteContent(key), PAGE_TTL_MS, siteContentChanges)]))

  router.get('/:key', async (req, res, next) => {
    try {
      const page = isSiteContentKey(req.params.key) ? pages.get(req.params.key) : undefined
      if (!page) throw new NotFoundError('Page not found.')
      return res.json(await page())
    } catch (error) {
      return next(error)
    }
  })

  return router
}
