import { Router } from 'express'
import { NotFoundError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import type { SiteContentKey } from '../models/SiteContent.js'
import { getSiteContent, listSiteContent, siteContentHistory, updateSiteContent } from '../services/siteContent.js'
import { validateOlderPageQuery } from '../validation/olderPage.js'
import { isSiteContentKey, validateSiteContentUpdate } from '../validation/siteContent.js'

// The site text staff edit (/api/admin/content), behind requireAdmin in app.ts. A save goes live at
// once; every change is recorded, so the history shows who changed the wording and what it said.
export default function adminSiteContentRouter() {
  const router = Router()

  function pageKey(value: unknown): SiteContentKey {
    if (!isSiteContentKey(value)) throw new NotFoundError('Page not found.')
    return value
  }

  router.get('/', async (_req, res, next) => {
    try {
      return res.json({ pages: await listSiteContent() })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/:key', async (req, res, next) => {
    try {
      const key = pageKey(req.params.key)
      const [page, history] = await Promise.all([getSiteContent(key), siteContentHistory(key, null)])
      return res.json({ page, ...history })
    } catch (error) {
      return next(error)
    }
  })

  // Older pages of the change history (the newest comes with the page).
  router.get('/:key/history', async (req, res, next) => {
    try {
      const key = pageKey(req.params.key)
      const { errors, value } = validateOlderPageQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await siteContentHistory(key, value.before))
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/:key', async (req, res, next) => {
    try {
      const key = pageKey(req.params.key)
      const { errors, value } = validateSiteContentUpdate(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const page = await updateSiteContent(currentAdmin(res), key, value)
      return res.json({ page, ...await siteContentHistory(key, null) })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
