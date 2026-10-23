import { Router } from 'express'
import { ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { bankTransferHistory, getBankTransferSettings, isSampleAccount, updateBankTransferSettings } from '../services/bankTransfer.js'
import type { Notifier } from '../services/notifications.js'
import { validateBankTransferUpdate } from '../validation/bankTransfer.js'
import { validateOlderPageQuery } from '../validation/olderPage.js'

// GPEC's bank details for bank-transfer payments (/api/admin/bank-transfer), behind requireAdmin in
// app.ts. Every change is recorded and emailed to all active admins.
export default function adminBankTransferRouter(notifier: Notifier) {
  const router = Router()

  router.get('/', async (_req, res, next) => {
    try {
      const [settings, history] = await Promise.all([getBankTransferSettings(), bankTransferHistory(null)])
      return res.json({ settings, isSample: isSampleAccount(settings), ...history })
    } catch (error) {
      return next(error)
    }
  })

  // Older pages of the change history (the newest comes with the settings).
  router.get('/history', async (req, res, next) => {
    try {
      const { errors, value } = validateOlderPageQuery(req.query)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      return res.json(await bankTransferHistory(value.before))
    } catch (error) {
      return next(error)
    }
  })

  router.patch('/', async (req, res, next) => {
    try {
      const { errors, value } = validateBankTransferUpdate(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const settings = await updateBankTransferSettings(currentAdmin(res), value, notifier)
      return res.json({ settings, isSample: isSampleAccount(settings), ...await bankTransferHistory(null) })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
