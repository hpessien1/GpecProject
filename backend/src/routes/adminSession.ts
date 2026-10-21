import { Router } from 'express'
import type { CookieOptions } from 'express'
import { rateLimit } from 'express-rate-limit'
import { HttpError, ValidationError } from '../errors.js'
import { requireAdmin, currentAdmin } from '../middleware/requireAdmin.js'
import { SESSION_COOKIE, SESSION_DURATION_MS, changePassword, logIn, logOut, readCookie } from '../services/adminAuth.js'
import { currencyInfo } from '../services/currency.js'
import { validateLogin, validatePasswordChange } from '../validation/adminSession.js'
import type { AppConfig } from '../app.js'

// Log in (POST), check who is logged in (GET), log out (DELETE), change own password (POST /password).
export default function adminSessionRouter(config: AppConfig) {
  const router = Router()
  // httpOnly: page scripts cannot read it. SameSite=Strict: other sites cannot make the browser send
  // it. Secure in production (HTTPS only). Sent only to admin routes.
  const cookieOptions: CookieOptions = { httpOnly: true, secure: config.isProduction, sameSite: 'strict', path: '/api/admin' }

  const limiterSettings = { ...config.adminLoginRateLimit, standardHeaders: 'draft-8', legacyHeaders: false } as const
  // Counts failed attempts only, so a mistyped password does not lock out someone who then gets it right.
  const loginLimiter = rateLimit({ ...limiterSettings, skipSuccessfulRequests: true, message: { message: 'Too many failed login attempts. Please wait 15 minutes and try again.' } })
  // Counts only wrong current passwords (the guessing risk if a session is stolen), not a new password
  // that is too short.
  const passwordLimiter = rateLimit({
    ...limiterSettings,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.locals.wrongPassword !== true,
    message: { message: 'Too many wrong passwords. Please wait 15 minutes and try again.' },
  })

  router.post('/', loginLimiter, async (req, res, next) => {
    try {
      const { errors, value } = validateLogin(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const result = await logIn(value.email, value.password)
      if (!result) throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS')
      res.cookie(SESSION_COOKIE, result.token, { ...cookieOptions, maxAge: SESSION_DURATION_MS })
      return res.json({ admin: { name: result.admin.name, email: result.admin.email }, currency: currencyInfo(config.currency) })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/', requireAdmin(config.clientOrigins), (_req, res) => {
    const admin = currentAdmin(res)
    return res.json({ admin: { name: admin.name, email: admin.email }, currency: currencyInfo(config.currency) })
  })

  router.post('/password', requireAdmin(config.clientOrigins), passwordLimiter, async (req, res, next) => {
    try {
      const { errors, value } = validatePasswordChange(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const changed = await changePassword(currentAdmin(res).id, value.currentPassword, value.newPassword, readCookie(req.headers.cookie, SESSION_COOKIE))
      // 400, not 401: the session is still valid, only the password typed was wrong.
      if (!changed) {
        res.locals.wrongPassword = true
        throw new HttpError(400, 'Your current password is incorrect.', 'WRONG_PASSWORD', { currentPassword: 'Your current password is incorrect.' })
      }
      return res.status(204).end()
    } catch (error) {
      return next(error)
    }
  })

  // Works even if the session has already expired, so the browser's cookie is always cleared.
  router.delete('/', async (req, res, next) => {
    try {
      await logOut(readCookie(req.headers.cookie, SESSION_COOKIE))
      res.clearCookie(SESSION_COOKIE, cookieOptions)
      return res.status(204).end()
    } catch (error) {
      return next(error)
    }
  })

  return router
}
