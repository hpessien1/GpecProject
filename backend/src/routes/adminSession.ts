import { Router } from 'express'
import type { CookieOptions } from 'express'
import { rateLimit } from 'express-rate-limit'
import { HttpError, ValidationError } from '../errors.js'
import { requireAdmin, currentAdmin } from '../middleware/requireAdmin.js'
import type { BreachedPasswordCheck } from '../services/breachedPasswords.js'
import { RESET_LINK_MINUTES, SESSION_COOKIE, SESSION_DURATION_MS, changePassword, createPasswordReset, logIn, logOut, readCookie, resetPassword } from '../services/adminAuth.js'
import { currencyInfo } from '../services/currency.js'
import type { Notifier } from '../services/notifications.js'
import { validateLogin, validatePasswordChange, validatePasswordReset, validatePasswordResetRequest } from '../validation/adminSession.js'
import type { AppConfig } from '../app.js'

const BREACHED_MESSAGE = 'This password has appeared in a data breach, so attackers try it early. Choose a different one.'
const RESET_REQUESTED_MESSAGE = `If this email address belongs to a GPEC admin account, a link to reset the password is on its way. It works for ${RESET_LINK_MINUTES} minutes. Check the spam folder if it does not arrive.`
const RESET_LINK_INVALID_MESSAGE = 'This reset link has expired or has already been used. Ask for a new one.'
const HOUR = 60 * 60 * 1000
// Reset emails per address per hour, so the form cannot flood an admin's inbox.
const RESETS_PER_ADDRESS_PER_HOUR = 3

// Log in (POST), check who is logged in (GET), log out (DELETE), change own password (POST /password),
// and "forgot password" (POST /password-reset asks for a link, POST /password-reset/confirm uses it).
// imageUploads: whether product photo uploads are set up, so the admin screens can offer them.
export default function adminSessionRouter(config: AppConfig, breachCheck: BreachedPasswordCheck, imageUploads: boolean, notifier: Notifier) {
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
  // Every request counts: the answer is always the same, so there is no "failed" one to skip.
  const resetRequestLimiter = rateLimit({ ...limiterSettings, message: { message: 'Too many reset requests. Please wait 15 minutes and try again.' } })
  // Counts only refused links, so a too-short new password does not use up the budget.
  const resetLimiter = rateLimit({
    ...limiterSettings,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.locals.wrongPassword !== true,
    message: { message: 'Too many attempts with reset links. Please wait 15 minutes and try again.' },
  })
  // In memory: one API instance only (CLAUDE.md, Section 6.3).
  const recentResets = new Map<string, number[]>()
  function mayEmailReset(address: string) {
    const now = Date.now()
    const recent = (recentResets.get(address) ?? []).filter((time) => now - time < HOUR)
    if (recent.length >= RESETS_PER_ADDRESS_PER_HOUR) return false
    recentResets.set(address, [...recent, now])
    return true
  }

  router.post('/', loginLimiter, async (req, res, next) => {
    try {
      const { errors, value } = validateLogin(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      const result = await logIn(value.email, value.password)
      if (!result) throw new HttpError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS')
      res.cookie(SESSION_COOKIE, result.token, { ...cookieOptions, maxAge: SESSION_DURATION_MS })
      return res.json({ admin: { name: result.admin.name, email: result.admin.email }, currency: currencyInfo(config.currency), imageUploads })
    } catch (error) {
      return next(error)
    }
  })

  router.get('/', requireAdmin(config.clientOrigins), (_req, res) => {
    const admin = currentAdmin(res)
    return res.json({ admin: { name: admin.name, email: admin.email }, currency: currencyInfo(config.currency), imageUploads })
  })

  router.post('/password', requireAdmin(config.clientOrigins), passwordLimiter, async (req, res, next) => {
    try {
      const { errors, value } = validatePasswordChange(req.body)
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      // A password known from a breach is among the first an attacker tries. If the check service
      // cannot be reached, the change goes ahead (the length rule still applies) rather than locking
      // staff out of changing their password; the skip is logged.
      const breached = await breachCheck.isBreached(value.newPassword)
      if (breached) throw new HttpError(400, BREACHED_MESSAGE, 'PASSWORD_BREACHED', { newPassword: BREACHED_MESSAGE })
      if (breached === null) console.warn('Password change: the breached-password check could not be made; the change went ahead without it.')
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

  // The same answer whether or not the address has an account, and the work happens after answering,
  // so neither the reply nor its timing reveals which addresses are admins.
  router.post('/password-reset', resetRequestLimiter, (req, res, next) => {
    if (!notifier.isOn) return next(new HttpError(503, 'Password reset by email is not set up yet. Ask the site administrator to reset your password.', 'PASSWORD_RESET_UNAVAILABLE'))
    const { errors, value: { email } } = validatePasswordResetRequest(req.body)
    if (Object.keys(errors).length > 0) return next(new ValidationError(errors))
    res.status(202).json({ message: RESET_REQUESTED_MESSAGE })
    if (!mayEmailReset(email)) return
    createPasswordReset(email)
      .then((reset) => reset && notifier.passwordResetRequested(reset.admin, reset.token, RESET_LINK_MINUTES))
      .catch((error: unknown) => console.error(`Password reset request could not be handled: ${error instanceof Error ? error.name : 'unknown error'}`))
  })

  router.post('/password-reset/confirm', resetLimiter, async (req, res, next) => {
    try {
      const { errors, value } = validatePasswordReset(req.body)
      if (errors.token) {
        res.locals.wrongPassword = true
        throw new HttpError(400, errors.token, 'RESET_LINK_INVALID')
      }
      if (Object.keys(errors).length > 0) throw new ValidationError(errors)
      // Checked before the link is used up, so a refused password can be replaced without a new link.
      const breached = await breachCheck.isBreached(value.newPassword)
      if (breached) throw new HttpError(400, BREACHED_MESSAGE, 'PASSWORD_BREACHED', { newPassword: BREACHED_MESSAGE })
      if (breached === null) console.warn('Password reset: the breached-password check could not be made; the reset went ahead without it.')
      const admin = await resetPassword(value.token, value.newPassword)
      if (!admin) {
        res.locals.wrongPassword = true
        throw new HttpError(400, RESET_LINK_INVALID_MESSAGE, 'RESET_LINK_INVALID')
      }
      // This browser may hold one of the sessions just ended.
      res.clearCookie(SESSION_COOKIE, cookieOptions)
      res.status(204).end()
      // After answering; never throws (a failed email is logged).
      return notifier.passwordChanged(admin)
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
