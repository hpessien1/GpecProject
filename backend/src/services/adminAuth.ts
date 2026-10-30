import { createHash, randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import type { ClientSession } from 'mongoose'
import type { CookieOptions } from 'express'
import AdminLoginChallenge from '../models/AdminLoginChallenge.js'
import AdminPasswordReset from '../models/AdminPasswordReset.js'
import AdminSession from '../models/AdminSession.js'
import AdminUser from '../models/AdminUser.js'
import type { BreachedPasswordCheck } from './breachedPasswords.js'
import { getDecoyHash, hashPassword, verifyPassword } from './passwords.js'
import { startLoginChallenge } from './twoFactor.js'
import type { TwoFactorMethod } from './twoFactor.js'

export const SESSION_COOKIE = 'gpec_admin_session'
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000
// The session cookie: httpOnly, so page scripts cannot read it; SameSite=Strict, so other sites cannot
// make the browser send it; Secure in production (HTTPS only); sent only to admin routes.
export const sessionCookieOptions = (isProduction: boolean): CookieOptions => ({ httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/api/admin' })
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

// A new session for an admin, in the given transaction if any (twoFactor.ts uses it too).
export async function createSession(adminId: unknown, credentialVersion: number, session: ClientSession | null = null) {
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

// Matches the account only while it is as it was when its password was checked: still active, the same
// password, and the same credentialVersion (audit S3-M01). A change checked against an older state, such
// as one that was still running when the owner reset the password, then saves nothing. Accounts stored
// before credentialVersion existed have none (read as 0).
export function unchangedSince(admin: { passwordHash: string, credentialVersion?: number | null }) {
  const version = admin.credentialVersion ?? 0
  return { isActive: true, passwordHash: admin.passwordHash, credentialVersion: version === 0 ? { $in: [0, null] } : version }
}

// The answer when a change was refused because the account changed after its password was checked.
export const ACCOUNT_CHANGED_MESSAGE = 'Your account changed while this was being saved, for example its password was reset. Log in again, then try again.'

// A new password cancels everything handed out under the old one, since someone else may know it:
// every session, "forgot password" link, login waiting for its code, and two-step login setup or
// emailed account code in progress. credentialVersion moves on too, so a session or login started
// from the old password while this runs is refused when used. Part of the caller's transaction, so
// the password never changes without the rest. Established two-step login stays on. expected: what the
// account must still be (unchangedSince) for a change made with its password; a reset link and the
// admin:create command have their own authority and pass none. Returns the new credentialVersion, or
// null if there is no such admin or it no longer matches.
async function replaceCredentials(session: ClientSession, adminId: unknown, passwordHash: string, expected: ReturnType<typeof unchangedSince> | Record<string, never> = {}) {
  const admin = await AdminUser.findOneAndUpdate({ _id: adminId, ...expected }, {
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
// cookie stops working too. Saved only if the account is still as it was when the current password was
// checked ('changed' otherwise: nothing saved, no session; audit S3-M01).
export async function changePassword(adminId: string, currentPassword: string, newPassword: string, breachCheck: BreachedPasswordCheck): Promise<{ status: 'ok', token: string, breachUnchecked: boolean } | { status: 'wrong-password' } | { status: 'breached' } | { status: 'changed' }> {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true }).lean()
  if (!admin || !await verifyPassword(currentPassword, admin.passwordHash)) return { status: 'wrong-password' }
  // After the current password, so a session alone (a copied cookie) never reaches the breached-password
  // service, as for reset links (audit S2-M03). null: the service could not be reached.
  const breached = await breachCheck.isBreached(newPassword)
  if (breached) return { status: 'breached' }
  const passwordHash = await hashPassword(newPassword)
  const token = await mongoose.connection.transaction(async (session) => {
    const version = await replaceCredentials(session, admin._id, passwordHash, unchangedSince(admin))
    return version === null ? null : createSession(admin._id, version, session)
  })
  return token === null ? { status: 'changed' } : { status: 'ok', token, breachUnchecked: breached === null }
}

// Starts a "forgot password" reset for an active admin: returns the token for the emailed link, or
// null when no active account has this email (the caller answers the same either way). A new link
// cancels any earlier one.
// Whether an address belongs to an active admin, so a reset request for any other address is neither
// counted nor kept (audit L-02).
export async function isActiveAdminEmail(email: string) {
  return (await AdminUser.exists({ email: email.toLowerCase(), isActive: true })) !== null
}

export async function createPasswordReset(email: string) {
  const admin = await AdminUser.findOne({ email: email.toLowerCase(), isActive: true })
  if (!admin) return null
  const token = randomBytes(32).toString('base64url')
  await AdminPasswordReset.deleteMany({ admin: admin._id })
  await AdminPasswordReset.create({ tokenHash: hashToken(token), admin: admin._id, expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000) })
  return { token, admin: { email: admin.email, name: admin.name } }
}

// Whether a reset link can still be used (known, unexpired, for an active admin), without using it
// up. Checked before anything else is done with the new password, so a made-up link causes no work
// (audit S2-M03: no call to the breached-password service).
export async function isUsableResetLink(token: string) {
  const reset = await AdminPasswordReset.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }, { admin: 1 }).lean()
  return reset !== null && await AdminUser.exists({ _id: reset.admin, isActive: true }) !== null
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
