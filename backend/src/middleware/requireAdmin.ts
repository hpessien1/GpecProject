import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../errors.js'
import { SESSION_COOKIE, findSessionAdmin, readCookie } from '../services/adminAuth.js'
import type { AdminIdentity } from '../services/adminAuth.js'
import { recordSecurityEvent } from '../services/securityLog.js'

// Lets routes read res.locals.admin with its type.
declare global {
  namespace Express {
    interface Locals {
      admin?: AdminIdentity
      // Set when a password change fails on the current password; read by its rate limiter.
      wrongPassword?: boolean
      // The API error code of a refused request (app.ts's error handler), and what a route adds for
      // the security log (middleware/securityEvent.ts).
      errorCode?: string
      securityReason?: string
      securityDetail?: string
      securityAccountId?: string
      securityAccountEmail?: string
    }
  }
}

// Every admin route goes through this one check (CLAUDE.md Section 4.5): a valid session for an
// active admin. Only one role exists, so being an admin is the role check.
export function requireAdmin(clientOrigins: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // The session cookie is SameSite=Strict, which already stops other sites from using it. As a
      // second guard, changes must come from the GPEC site itself when the browser says where from.
      const origin = req.headers.origin
      if (req.method !== 'GET' && req.method !== 'HEAD' && origin && !clientOrigins.includes(origin)) {
        // Recorded (audit M-06): another site trying to make a change with an admin's browser.
        void recordSecurityEvent(req, { action: 'access.refused', outcome: 'failure', reason: 'ORIGIN_NOT_ALLOWED' })
        throw new HttpError(403, 'This request is not allowed from this site.', 'ORIGIN_NOT_ALLOWED')
      }
      const admin = await findSessionAdmin(readCookie(req.headers.cookie, SESSION_COOKIE))
      if (!admin) throw new HttpError(401, 'Please log in to continue.', 'ADMIN_AUTH_REQUIRED')
      res.locals.admin = admin
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

// The admin set by requireAdmin. Throws if a route forgot to use it, rather than acting anonymously.
export function currentAdmin(res: Response): AdminIdentity {
  if (!res.locals.admin) throw new Error('Admin route reached without requireAdmin.')
  return res.locals.admin
}
