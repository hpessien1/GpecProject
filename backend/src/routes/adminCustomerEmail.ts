import { Router } from 'express'
import { ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { customerEmailHistory, getCustomerEmailSettings, updateCustomerEmailSettings } from '../services/customerEmail.js'
import type { Notifier } from '../services/notifications.js'
import { validateCustomerEmailUpdate } from '../validation/customerEmail.js'
import { validateOlderPageQuery } from '../validation/olderPage.js'

// Settings for the emails customers receive (/api/admin/customer-email): the reply-to address.
// Behind requireAdmin in app.ts. Every change is recorded and emailed to all active admins.
export default function adminCustomerEmailRouter(notifier: Notifier) {
  const router = Router()

  router.get('/', async (_req, res, next) => {
    try {
      const [settings, history] = await Promise.all([getCustomerEmailSettings(), customerEmailHistory(null)])
      return res.json({ settings, emailOn: notifier.isOn, ...history })
    } catch (error) {
      return next(error)
    }
  })

  // Older pages of the change history (the newest comes with the settings).
  router.get('/history', async (req, res, next) => {
    try {
      const { errors, value } = validateOlderPageQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await customerEmailHistory(value.before))
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/', async (req, res, next) => {
    try {
      const { errors, value } = validateCustomerEmailUpdate(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const settings = await updateCustomerEmailSettings(currentAdmin(res), value, notifier)
      return res.json({ settings, emailOn: notifier.isOn, ...await customerEmailHistory(null) })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
