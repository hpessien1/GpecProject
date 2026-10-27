import { Router } from 'express'
import type { Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { HttpError, ValidationError } from '../errors.js'
import { currentAdmin } from '../middleware/requireAdmin.js'
import { securityEvent } from '../middleware/securityEvent.js'
import { SESSION_COOKIE, readCookie } from '../services/adminAuth.js'
import type { Notifier } from '../services/notifications.js'
import { EMAIL_CODE_MINUTES, createAccountEmailCode, disableTwoFactor, enableTwoFactor, regenerateRecoveryCodes, startAppSetup, twoFactorStatus } from '../services/twoFactor.js'
import type { VerifiedResult } from '../services/twoFactor.js'
import { validateEnable, validateVerifiedAction } from '../validation/twoFactor.js'
import type { AppConfig } from '../app.js'

const WRONG_PASSWORD = 'Your password is incorrect.'
const WRONG_CODE = 'That code is not right, or has already been used.'

// The logged-in admin's own two-step login (/api/admin/account/two-factor), behind requireAdmin in
// app.ts: see whether it is on, set it up with an authenticator app or email codes, turn it off, and
// make new recovery codes. Each admin manages only their own account.
export default function adminAccountRouter(config: AppConfig, notifier: Notifier) {
  const router = Router()
  const limiterSettings = { ...config.adminLoginRateLimit, standardHeaders: 'draft-8', legacyHeaders: false } as const
  // Counts wrong passwords and wrong codes (the guessing risk if a session is stolen), as for password
  // changes; other refusals do not count.
  const verifyLimiter = rateLimit({
    ...limiterSettings,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.locals.wrongPassword !== true,
    message: { message: 'Too many wrong passwords or codes. Please wait 15 minutes and try again.' },
  })
  // Every request counts: each one can send an email.
  const emailCodeLimiter = rateLimit({ ...limiterSettings, message: { message: 'Too many codes asked for. Please wait 15 minutes and try again.' } })

  const available = () => ({ app: config.twoFactorKey !== null, email: notifier.isOn })
  const statusReply = async (adminId: string) => ({ ...await twoFactorStatus(adminId), available: available() })

  // Turns a refused password or code into its answer, and marks it for the limiter.
  function refuse(result: Exclude<VerifiedResult, { status: 'ok' }>, res: Response): never {
    if (result.status === 'off') throw new HttpError(409, 'Two-step login is already off.', 'TWO_FACTOR_OFF')
    res.locals.wrongPassword = true
    if (result.status === 'wrong-password') throw new HttpError(400, WRONG_PASSWORD, 'WRONG_PASSWORD', { password: WRONG_PASSWORD })
    throw new HttpError(400, WRONG_CODE, 'WRONG_CODE', { code: WRONG_CODE })
  }

  router.get('/two-factor', async (_req, res, next) => {
    try {
      return res.json(await statusReply(currentAdmin(res).id))
    } catch (error) {
      return next(error)
    }
  })

  // Starts an authenticator app: the QR code's link and the key to type, shown once.
  router.post('/two-factor/app', async (_req, res, next) => {
    try {
      const admin = currentAdmin(res)
      if (!config.twoFactorKey) throw new HttpError(409, 'Authenticator apps are not set up on this website yet. Use a code by email, or ask the site administrator.', 'APP_CODES_UNAVAILABLE')
      if ((await twoFactorStatus(admin.id)).method) throw new HttpError(409, 'Two-step login is already on. Turn it off first to change how you get codes.', 'TWO_FACTOR_ALREADY_ON')
      const setup = await startAppSetup(admin.id, config.twoFactorKey)
      if (!setup) throw new HttpError(401, 'Please log in to continue.', 'ADMIN_AUTH_REQUIRED')
      return res.json(setup)
    } catch (error) {
      return next(error)
    }
  })

  // Emails a code to the logged-in admin: to set up email codes, or to confirm turning two-step login
  // off or making new recovery codes.
  router.post('/two-factor/email-code', emailCodeLimiter, async (_req, res, next) => {
    try {
      if (!notifier.isOn) throw new HttpError(503, 'Codes cannot be emailed right now: email is not set up on this website.', 'EMAIL_UNAVAILABLE')
      const result = await createAccountEmailCode(currentAdmin(res).id)
      if (!result) throw new HttpError(401, 'Please log in to continue.', 'ADMIN_AUTH_REQUIRED')
      if (result === 'too-soon') throw new HttpError(429, 'A code was sent less than a minute ago. Check your inbox and spam folder, then try again.', 'CODE_TOO_SOON')
      res.status(202).json({ message: `A code is on its way to ${result.admin.email}. It works for ${EMAIL_CODE_MINUTES} minutes.` })
      return notifier.accountCode(result.admin, result.code, EMAIL_CODE_MINUTES)
    } catch (error) {
      return next(error)
    }
  })

  // Turns it on with the password and a first code from the chosen method. The ten recovery codes are
  // in this answer only; the admin's other sessions end.
  // Turning two-step login on or off, and new recovery codes, go in the security log (audit M-06).
  router.post('/two-factor/enable', securityEvent('twoFactor.enable', { signedInOnly: true }), verifyLimiter, async (req, res, next) => {
    try {
      const admin = currentAdmin(res)
      const { errors, value } = validateEnable(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      if (value.method === 'email' && !notifier.isOn) throw new HttpError(409, 'Codes cannot be emailed right now: email is not set up on this website.', 'EMAIL_UNAVAILABLE')
      const result = await enableTwoFactor(admin.id, value.method, value.password, value.code, config.twoFactorKey, readCookie(req.headers.cookie, SESSION_COOKIE))
      if (result.status === 'already-on') throw new HttpError(409, 'Two-step login is already on.', 'TWO_FACTOR_ALREADY_ON')
      if (result.status === 'not-started') throw new HttpError(409, value.method === 'app' ? 'Start again: the setup has timed out.' : 'Ask for a new code: the last one has expired or was used.', 'SETUP_NOT_STARTED')
      if (result.status === 'wrong-password') {
        res.locals.wrongPassword = true
        throw new HttpError(400, WRONG_PASSWORD, 'WRONG_PASSWORD', { password: WRONG_PASSWORD })
      }
      if (result.status === 'wrong') {
        res.locals.wrongPassword = true
        throw new HttpError(400, WRONG_CODE, 'WRONG_CODE', { code: WRONG_CODE })
      }
      res.locals.securityDetail = value.method
      res.json({ recoveryCodes: result.recoveryCodes, ...await statusReply(admin.id) })
      return notifier.twoFactorChanged(admin, { on: true, method: value.method })
    } catch (error) {
      return next(error)
    }
  })

  router.post('/two-factor/disable', securityEvent('twoFactor.disable', { signedInOnly: true }), verifyLimiter, async (req, res, next) => {
    try {
      const admin = currentAdmin(res)
      const { errors, value } = validateVerifiedAction(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const result = await disableTwoFactor(admin.id, value.password, value.step, config.twoFactorKey)
      if (result.status !== 'ok') refuse(result, res)
      res.json(await statusReply(admin.id))
      return notifier.twoFactorChanged(admin, { on: false })
    } catch (error) {
      return next(error)
    }
  })

  // Ten new recovery codes, in this answer only; the old ones stop working.
  router.post('/two-factor/recovery-codes', securityEvent('twoFactor.recoveryCodes', { signedInOnly: true }), verifyLimiter, async (req, res, next) => {
    try {
      const admin = currentAdmin(res)
      const { errors, value } = validateVerifiedAction(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const result = await regenerateRecoveryCodes(admin.id, value.password, value.step, config.twoFactorKey)
      if (result.status !== 'ok') refuse(result, res)
      return res.json({ recoveryCodes: result.recoveryCodes, ...await statusReply(admin.id) })
    } catch (error) {
      return next(error)
    }
  })

  return router
}
