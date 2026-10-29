import type { Request, RequestHandler } from 'express'
import type { SecurityAction } from '../models/SecurityEvent.js'
import { recordSecurityEvent } from '../services/securityLog.js'
import type { SecurityEventInput } from '../services/securityLog.js'

interface SecurityEventOptions {
  // Who the entry is about when it may not be the logged-in admin (a login, a logout): found before the
  // route runs, as the route may end what it is found by (a login waiting for its code, a session).
  account?: (req: Request) => Promise<{ adminId?: string | null, email?: string | null } | null>
  // The customer record opened, from the route's parameters.
  target?: (req: Request) => SecurityEventInput['target']
  // Record only when an admin is logged in: a visitor without a session is simply refused.
  signedInOnly?: boolean
  // Record only when the account is found: a logout without a session ends nothing (audit S2-M02:
  // anyone can send one, as often as they like).
  accountOnly?: boolean
}

// Records the request in the security log (audit M-06) once its answer has gone out: a success below
// 400, otherwise a failure with the API's error code (set by the error handler) or, for a rate
// limit's refusal, TOO_MANY_ATTEMPTS. A route can add res.locals.securityReason (a more exact
// reason), res.locals.securityDetail, and res.locals.securityAccountId or securityAccountEmail (the
// account, once known).
// Mounted before a route's rate limiter, so its refusals are recorded too.
export function securityEvent(action: SecurityAction, options: SecurityEventOptions = {}): RequestHandler {
  return (req, res, next) => {
    const target = options.target?.(req) ?? null
    const found = options.account ? options.account(req).catch(() => null) : Promise.resolve(null)
    res.once('finish', () => {
      const admin = res.locals.admin
      if (options.signedInOnly && !admin) return
      const failed = res.statusCode >= 400
      void found.then((account) => (options.accountOnly && !account?.adminId && !account?.email) ? undefined : recordSecurityEvent(req, {
        action,
        outcome: failed ? 'failure' : 'success',
        reason: failed ? res.locals.securityReason ?? res.locals.errorCode ?? (res.statusCode === 429 ? 'TOO_MANY_ATTEMPTS' : `HTTP_${res.statusCode}`) : null,
        detail: failed ? null : res.locals.securityDetail ?? null,
        adminId: res.locals.securityAccountId ?? admin?.id ?? account?.adminId ?? null,
        email: res.locals.securityAccountEmail ?? account?.email ?? null,
        target,
      }))
    })
    return next()
  }
}
