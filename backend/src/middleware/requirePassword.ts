import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { RateLimitSettings } from '../config.js'
import { HttpError, ValidationError } from '../errors.js'
import { currentAdmin } from './requireAdmin.js'
import { WRONG_PASSWORDS_PER_HOUR, checkAdminPassword } from '../services/adminAuth.js'
import type { AdminIdentity, PasswordPause } from '../services/adminAuth.js'
import { utcTime } from '../services/emailTemplates.js'
import type { Notifier } from '../services/notifications.js'
import { recordSecurityEvent } from '../services/securityLog.js'
import { asFields } from '../validation/fields.js'

const WRONG_PASSWORD = 'Your password is incorrect.'

// The answer when the admin's password is refused because of WRONG_PASSWORDS_PER_HOUR, on the form's
// password field, here or at login. Inside the panel it says so openly: the session already names the
// account. Counts as a wrong password for the per-IP limit, gives the security log its reason, and the
// guess that used the last try emails the admin (once; never throws).
export function passwordPausedError(pause: PasswordPause, admin: AdminIdentity, notifier: Notifier, res: Response, field = 'password') {
  res.locals.wrongPassword = true
  res.locals.securityReason = pause.pausedNow ? 'PASSWORD_PAUSED_NOW' : 'PASSWORD_PAUSED'
  if (pause.pausedNow) void notifier.loginPaused(admin, WRONG_PASSWORDS_PER_HOUR, pause.until)
  const message = `Too many wrong passwords have been entered for your account in the last hour, so logging in and changes that need your password are paused until ${utcTime(pause.until)}. To end the pause now, set a new password with “Forgot your password?” on the login page.`
  return new HttpError(429, message, 'PASSWORD_PAUSED', { [field]: message })
}

// For changes that decide where money or customers' replies go (CLAUDE.md Section 4.5): GPEC's bank
// details, the reply-to address, and confirming a bank transfer arrived. A session alone, such as a
// browser left logged in or a copied cookie, is not enough: the admin's current password comes with
// the change, as `password`, so it confirms that change and no other. Runs after requireAdmin. The
// password is taken out of the body, so the change's own validator sees only its fields and it is
// never stored. Wrong passwords count toward one per-IP limit shared by every route using this check,
// and toward the account's hourly tries (checkAdminPassword).
export function requirePassword(limit: RateLimitSettings, notifier: Notifier): RequestHandler {
  const limiter = rateLimit({
    ...limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.locals.wrongPassword !== true,
    message: { message: 'Too many wrong passwords. Please wait 15 minutes and try again.' },
  })
  const check = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { password, ...rest } = asFields(req.body)
      if (typeof password !== 'string' || !password) throw new ValidationError({ password: 'Enter your password.' })
      if (password.length > 200) throw new ValidationError({ password: 'Passwords are at most 200 characters.' })
      const admin = currentAdmin(res)
      const check = await checkAdminPassword(admin.id, password)
      if (check.status !== 'right') {
        const error = check.status === 'paused' ? passwordPausedError(check.pause, admin, notifier, res) : new HttpError(400, WRONG_PASSWORD, 'WRONG_PASSWORD', { password: WRONG_PASSWORD })
        res.locals.wrongPassword = true
        // Recorded (audit M-06): someone with the session may be guessing the password.
        void recordSecurityEvent(req, { action: 'password.confirm', outcome: 'failure', reason: res.locals.securityReason ?? 'WRONG_PASSWORD', adminId: admin.id })
        throw error
      }
      req.body = rest
      return next()
    } catch (error) {
      return next(error)
    }
  }
  return (req, res, next) => limiter(req, res, (error?: unknown) => error ? next(error) : check(req, res, next))
}
