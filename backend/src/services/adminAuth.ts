import { createHash, randomBytes } from 'node:crypto'
import AdminPasswordReset from '../models/AdminPasswordReset.js'
import AdminSession from '../models/AdminSession.js'
import AdminUser from '../models/AdminUser.js'
import { getDecoyHash, hashPassword, verifyPassword } from './passwords.js'

export const SESSION_COOKIE = 'gpec_admin_session'
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000
// How long a "forgot password" link works. Short, because the link is as good as a password.
export const RESET_LINK_MINUTES = 30

export interface AdminIdentity {
  id: string
  email: string
  name: string
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// Returns a new session token for valid, active credentials; null otherwise (never says which part
// was wrong).
export async function logIn(email: string, password: string) {
  const admin = await AdminUser.findOne({ email: email.toLowerCase() })
  const passwordMatches = await verifyPassword(password, admin?.passwordHash ?? await getDecoyHash())
  if (!admin || !admin.isActive || !passwordMatches) return null

  const token = randomBytes(32).toString('base64url')
  await AdminSession.create({ tokenHash: hashToken(token), admin: admin._id, expiresAt: new Date(Date.now() + SESSION_DURATION_MS) })
  admin.lastLoginAt = new Date()
  await admin.save()
  return { token, admin: { id: admin.id, email: admin.email, name: admin.name } }
}

// The admin behind a session token, or null if the session is unknown, expired, or the account has
// been deactivated. MongoDB removes expired sessions on its own schedule, so expiry is checked here too.
export async function findSessionAdmin(token: string): Promise<AdminIdentity | null> {
  if (!token) return null
  const session = await AdminSession.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean()
  if (!session) return null
  const admin = await AdminUser.findOne({ _id: session.admin, isActive: true }).lean()
  return admin ? { id: admin._id.toString(), email: admin.email, name: admin.name } : null
}

// Changes an admin's own password after checking the current one. Every other session of that admin
// is ended (a change often means the old password may be known to someone else); the session making
// the change stays logged in. Returns false if the current password is wrong.
export async function changePassword(adminId: string, currentPassword: string, newPassword: string, currentToken: string) {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true })
  if (!admin || !await verifyPassword(currentPassword, admin.passwordHash)) return false
  admin.passwordHash = await hashPassword(newPassword)
  admin.passwordChangedAt = new Date()
  await admin.save()
  await AdminSession.deleteMany({ admin: admin._id, tokenHash: { $ne: hashToken(currentToken) } })
  return true
}

// Starts a "forgot password" reset for an active admin: returns the token for the emailed link, or
// null when no active account has this email (the caller answers the same either way). A new link
// cancels any earlier one.
export async function createPasswordReset(email: string) {
  const admin = await AdminUser.findOne({ email: email.toLowerCase(), isActive: true })
  if (!admin) return null
  const token = randomBytes(32).toString('base64url')
  await AdminPasswordReset.deleteMany({ admin: admin._id })
  await AdminPasswordReset.create({ tokenHash: hashToken(token), admin: admin._id, expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000) })
  return { token, admin: { email: admin.email, name: admin.name } }
}

// Sets a new password from a reset link. The link is used up in the same step that checks it, so it
// works at most once even if sent twice at the same moment. Every session of that admin is ended,
// since someone else may have known the old password. Returns the admin, or null if the link is
// unknown, expired, already used, or the account has been deactivated.
export async function resetPassword(token: string, newPassword: string) {
  const reset = await AdminPasswordReset.findOneAndDelete({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean()
  if (!reset) return null
  const admin = await AdminUser.findOne({ _id: reset.admin, isActive: true })
  if (!admin) return null
  admin.passwordHash = await hashPassword(newPassword)
  admin.passwordChangedAt = new Date()
  await admin.save()
  await AdminSession.deleteMany({ admin: admin._id })
  await AdminPasswordReset.deleteMany({ admin: admin._id })
  return { email: admin.email, name: admin.name }
}

export async function logOut(token: string) {
  if (token) await AdminSession.deleteOne({ tokenHash: hashToken(token) })
}

// Reads one cookie from a Cookie header without adding a cookie-parsing dependency.
export function readCookie(header: string | undefined, name: string) {
  for (const part of header?.split(';') ?? []) {
    const separator = part.indexOf('=')
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim()
  }
  return ''
}
