import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { RateLimitSettings } from '../config.js'
import { HttpError, ValidationError } from '../errors.js'
import { currentAdmin } from './requireAdmin.js'
import { isCurrentPassword } from '../services/adminAuth.js'
import { asFields } from '../validation/fields.js'

const WRONG_PASSWORD = 'Your password is incorrect.'

// For changes that decide where money or customers' replies go (CLAUDE.md Section 4.5): GPEC's bank
// details, the reply-to address, and confirming a bank transfer arrived. A session alone, such as a
// browser left logged in or a copied cookie, is not enough: the admin's current password comes with
// the change, as `password`, so it confirms that change and no other. Runs after requireAdmin. The
// password is taken out of the body, so the change's own validator sees only its fields and it is
// never stored. Wrong passwords count toward one per-IP limit shared by every route using this check.
export function requirePassword(limit: RateLimitSettings): RequestHandler {
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
      if (!await isCurrentPassword(currentAdmin(res).id, password)) {
        res.locals.wrongPassword = true
        throw new HttpError(400, WRONG_PASSWORD, 'WRONG_PASSWORD', { password: WRONG_PASSWORD })
      }
      req.body = rest
      return next()
    } catch (error) {
      return next(error)
    }
  }
  return (req, res, next) => limiter(req, res, (error?: unknown) => error ? next(error) : check(req, res, next))
}
