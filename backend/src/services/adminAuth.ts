import { createHash, randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import type { ClientSession } from 'mongoose'
import AdminLoginChallenge from '../models/AdminLoginChallenge.js'
import AdminPasswordReset from '../models/AdminPasswordReset.js'
import AdminSession from '../models/AdminSession.js'
import AdminUser from '../models/AdminUser.js'
import { getDecoyHash, hashPassword, verifyPassword } from './passwords.js'
import { startLoginChallenge } from './twoFactor.js'
import type { TwoFactorMethod } from './twoFactor.js'

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

export type LoginResult =
  | { kind: 'session', token: string, admin: AdminIdentity }
  // Two-step login is on: the code is still needed (services/twoFactor.ts). emailCode: to send now.
  | { kind: 'challenge', token: string, method: TwoFactorMethod, emailCode: string | null, admin: AdminIdentity }

// Starts a session for valid, active credentials, or for an admin with two-step login a challenge for
// the code; null otherwise (never says which part was wrong).
export async function logIn(email: string, password: string): Promise<LoginResult | null> {
  const admin = await AdminUser.findOne({ email: email.toLowerCase() })
  const passwordMatches = await verifyPassword(password, admin?.passwordHash ?? await getDecoyHash())
  if (!admin || !admin.isActive || !passwordMatches) return null
  const identity = { id: admin.id, email: admin.email, name: admin.name }
  if (admin.twoFactorMethod === 'app' || admin.twoFactorMethod === 'email') {
    const { token, emailCode } = await startLoginChallenge(admin)
    return { kind: 'challenge', token, method: admin.twoFactorMethod, emailCode, admin: identity }
  }
  return { kind: 'session', token: await startSession(admin._id, admin.credentialVersion ?? 0), admin: identity }
}

async function createSession(adminId: unknown, credentialVersion: number, session: ClientSession | null = null) {
  const token = randomBytes(32).toString('base64url')
  await AdminSession.create([{ tokenHash: hashToken(token), admin: adminId, credentialVersion, expiresAt: new Date(Date.now() + SESSION_DURATION_MS) }], { session })
  return token
}

// A new 8-hour session; the cookie gets the token. Also records the login time. credentialVersion: the
// admin's when their password was checked, so a password changed meanwhile ends the session at once.
export async function startSession(adminId: unknown, credentialVersion: number) {
  const token = await createSession(adminId, credentialVersion)
  await AdminUser.updateOne({ _id: adminId }, { lastLoginAt: new Date() })
  return token
}

// What the admin screens need about two-step login for this session: whether it is on, and whether to
// show the banner suggesting it (off, and not closed since this login).
export async function sessionTwoFactor(token: string, adminId: string) {
  const [session, admin] = await Promise.all([AdminSession.findOne({ tokenHash: hashToken(token) }).lean(), AdminUser.findById(adminId).lean()])
  const enabled = Boolean(admin?.twoFactorMethod)
  return { enabled, prompt: !enabled && !session?.twoFactorPromptDismissed }
}

export async function dismissTwoFactorPrompt(token: string) {
  await AdminSession.updateOne({ tokenHash: hashToken(token) }, { twoFactorPromptDismissed: true })
}

// The admin behind a session token, or null if the session is unknown, expired, started under a
// password that has since changed, or the account has been deactivated. MongoDB removes expired
// sessions on its own schedule, so expiry is checked here too.
export async function findSessionAdmin(token: string): Promise<AdminIdentity | null> {
  if (!token) return null
  const session = await AdminSession.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean()
  if (!session) return null
  const admin = await AdminUser.findOne({ _id: session.admin, isActive: true }).lean()
  if (!admin || (session.credentialVersion ?? 0) !== (admin.credentialVersion ?? 0)) return null
  return { id: admin._id.toString(), email: admin.email, name: admin.name }
}

// A new password cancels everything handed out under the old one, since someone else may know it:
// every session, "forgot password" link, login waiting for its code, and two-step login setup or
// emailed account code in progress. credentialVersion moves on too, so a session or login started
// from the old password while this runs is refused when used. Part of the caller's transaction, so
// the password never changes without the rest. Established two-step login stays on. Returns the new
// credentialVersion, or null if there is no such admin.
async function replaceCredentials(session: ClientSession, adminId: unknown, passwordHash: string) {
  const admin = await AdminUser.findOneAndUpdate({ _id: adminId }, {
    passwordHash,
    passwordChangedAt: new Date(),
    $inc: { credentialVersion: 1 },
    pendingTwoFactorSecret: null,
    pendingTwoFactorExpiresAt: null,
    accountCodeHash: null,
    accountCodeExpiresAt: null,
  }, { new: true, session }).lean()
  if (!admin) return null
  await AdminSession.deleteMany({ admin: admin._id }, { session })
  await AdminPasswordReset.deleteMany({ admin: admin._id }, { session })
  await AdminLoginChallenge.deleteMany({ admin: admin._id }, { session })
  return admin.credentialVersion ?? 0
}

// For admin:create --reset (scripts/createAdmin.ts): a new password, with everything replaceCredentials
// cancels. Returns false if there is no such admin.
export async function replacePassword(adminId: unknown, passwordHash: string) {
  const version = await mongoose.connection.transaction((session) => replaceCredentials(session, adminId, passwordHash))
  return version !== null
}

// Whether this is the admin's current password (middleware/requirePassword.ts).
export async function isCurrentPassword(adminId: string, password: string) {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true }).lean()
  return verifyPassword(password, admin?.passwordHash ?? await getDecoyHash())
}

// Changes an admin's own password after checking the current one. Everything started under the old
// password ends (replaceCredentials); this browser gets a new session token, so a copy of its old
// cookie stops working too. Returns that token, or null if the current password is wrong.
export async function changePassword(adminId: string, currentPassword: string, newPassword: string) {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true })
  if (!admin || !await verifyPassword(currentPassword, admin.passwordHash)) return null
  const passwordHash = await hashPassword(newPassword)
  return mongoose.connection.transaction(async (session) => {
    const version = await replaceCredentials(session, admin._id, passwordHash)
    return version === null ? null : createSession(admin._id, version, session)
  })
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

// Sets a new password from a reset link. The link is used up in the same transaction that sets the
// password, so it works at most once even if sent twice at the same moment, and everything started
// under the old password ends (replaceCredentials). Returns the admin, or null if the link is
// unknown, expired, already used, or the account has been deactivated.
export async function resetPassword(token: string, newPassword: string) {
  const filter = { tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }
  // Checked first so a made-up link costs no password hashing; used up below.
  if (!await AdminPasswordReset.exists(filter)) return null
  const passwordHash = await hashPassword(newPassword)
  return mongoose.connection.transaction(async (session) => {
    const reset = await AdminPasswordReset.findOneAndDelete(filter, { session }).lean()
    if (!reset) return null
    const admin = await AdminUser.findOne({ _id: reset.admin, isActive: true }).session(session).lean()
    if (!admin || await replaceCredentials(session, admin._id, passwordHash) === null) return null
    return { email: admin.email, name: admin.name }
  })
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
