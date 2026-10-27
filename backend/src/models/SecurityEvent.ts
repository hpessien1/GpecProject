import mongoose from 'mongoose'

// The security log (audit M-06): logins and attempts, changes to an admin's own login, and customer
// records staff opened, so GPEC can notice and look into a misused account. Written by the server
// only (services/securityLog.ts); the site can read it but never change or delete an entry. Kept for
// 12 months (the user's choice, 2026-10-27), then MongoDB deletes it. Never holds passwords, codes,
// links, cookies, or customers' details: only references.

export const SECURITY_ACTIONS = [
  // Logging in: the password step, the two-step code, and logging out.
  'login.password', 'login.code', 'logout',
  // An admin's own login: password changed, reset asked for and used, two-step login turned on or
  // off, new recovery codes, and a wrong password given again for a sensitive change.
  'password.change', 'password.resetRequest', 'password.reset', 'password.confirm',
  'twoFactor.enable', 'twoFactor.disable', 'twoFactor.recoveryCodes',
  // A change refused because it did not come from GPEC's own site.
  'access.refused',
  // Customer records opened by staff.
  'record.order', 'record.contactRequest', 'record.file',
  // The admin command on the server (npm run admin:create).
  'command.create', 'command.reset', 'command.disableTwoFactor',
] as const
export type SecurityAction = typeof SECURITY_ACTIONS[number]

export const TARGET_TYPES = ['order', 'contactRequest', 'file'] as const

const KEEP_FOR_SECONDS = 365 * 24 * 60 * 60

// The account the entry is about, copied at the time (as in AuditRecord), with its role then, ready
// for when GPEC adds roles with fewer permissions.
const accountSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
}, { _id: false })

const securityEventSchema = new mongoose.Schema({
  action: { type: String, required: true, enum: SECURITY_ACTIONS },
  outcome: { type: String, required: true, enum: ['success', 'failure'] },
  // Why it failed, as the API's error code (WRONG_PASSWORD, TOO_MANY_ATTEMPTS, …); null on success.
  reason: { type: String, default: null, maxlength: 60 },
  // More about a success: code_needed (a password step waiting for its code), or the kind of code used
  // (app, email, recovery_code).
  detail: { type: String, default: null, maxlength: 60 },
  // null when no account could be named (an unknown address, a refused link).
  account: { type: accountSchema, default: null },
  target: {
    type: new mongoose.Schema({ type: { type: String, required: true, enum: TARGET_TYPES }, id: { type: String, required: true, maxlength: 120 } }, { _id: false }),
    default: null,
  },
  via: { type: String, required: true, enum: ['website', 'command line'] },
  // The visitor's internet address and browser, from the request; empty for the command.
  ip: { type: String, default: '', maxlength: 60 },
  userAgent: { type: String, default: '', maxlength: 300 },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' })

securityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: KEEP_FOR_SECONDS })
securityEventSchema.index({ 'account.adminId': 1, createdAt: -1 })

export default mongoose.model('SecurityEvent', securityEventSchema)
