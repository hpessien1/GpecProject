import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import mongoose from 'mongoose'
import AdminLoginChallenge from '../models/AdminLoginChallenge.js'
import AdminSession from '../models/AdminSession.js'
import AdminUser from '../models/AdminUser.js'
import { createSession, unchangedSince } from './adminAuth.js'
import { verifyPassword } from './passwords.js'
import { open, seal } from './secretBox.js'
import { matchTotp, newTotpSecret, otpauthUri, toBase32 } from './totp.js'

// Two-step login for admins (CLAUDE.md Section 4.5): optional, turned on and off by each admin for
// their own account. After the password, a 6-digit code from an authenticator app or from an email,
// or one of ten single-use recovery codes.

export type TwoFactorMethod = 'app' | 'email'

export const CHALLENGE_MINUTES = 10
export const EMAIL_CODE_MINUTES = 10
// Wrong codes allowed for one login (or one emailed account code) before it must start again. The
// per-IP failed-login limit applies as well.
export const MAX_CODE_ATTEMPTS = 5
// Emailed codes: at most one a minute, and five for one login.
export const EMAIL_CODE_COOLDOWN_MS = 60 * 1000
export const MAX_EMAIL_CODES = 5
export const RECOVERY_CODE_COUNT = 10
// For the whole account, per hour, whoever is logging in and from where: login codes emailed (at
// login and "send a new code"), and wrong 6-digit codes entered at login. Someone who knows the
// password could otherwise start login after login, each with an email and five fresh guesses. Once
// the wrong codes reach the limit, only recovery codes work until the hour is up: they cannot be
// guessed, so the owner always has a way in.
export const LOGIN_EMAILS_PER_HOUR = 5
export const WRONG_CODES_PER_HOUR = 10
const HOUR_MS = 60 * 60 * 1000
// An app being set up must be confirmed within this time.
const SETUP_MINUTES = 15
const ISSUER = 'GPEC Admin'

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000)
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

interface HourlyLimit {
  start: 'loginEmailWindowStart' | 'wrongCodeWindowStart'
  count: 'loginEmailsInWindow' | 'wrongCodesInWindow'
  limit: number
}
const LOGIN_EMAILS: HourlyLimit = { start: 'loginEmailWindowStart', count: 'loginEmailsInWindow', limit: LOGIN_EMAILS_PER_HOUR }
const WRONG_CODES: HourlyLimit = { start: 'wrongCodeWindowStart', count: 'wrongCodesInWindow', limit: WRONG_CODES_PER_HOUR }

// Uses one of the account's allowance for this hour; false once it is used up. The count is part of
// the update's condition, so two requests at the same moment cannot both take the last one.
async function takeHourly(adminId: unknown, { start, count, limit }: HourlyLimit) {
  const hourAgo = new Date(Date.now() - HOUR_MS)
  const newHour = await AdminUser.updateOne({ _id: adminId, $or: [{ [start]: null }, { [start]: { $lte: hourAgo } }] }, { [start]: new Date(), [count]: 1 })
  if (newHour.matchedCount === 1) return true
  const taken = await AdminUser.updateOne({ _id: adminId, [start]: { $gt: hourAgo }, [count]: { $lt: limit } }, { $inc: { [count]: 1 } })
  return taken.matchedCount === 1
}

function hourlyUsedUp(admin: Partial<Record<HourlyLimit['start'], Date | null> & Record<HourlyLimit['count'], number | null>>, { start, count, limit }: HourlyLimit) {
  const started = admin[start]
  return Boolean(started && started.getTime() > Date.now() - HOUR_MS && (admin[count] ?? 0) >= limit)
}

function sameHash(hash: string | null | undefined, value: string) {
  if (!hash) return false
  return timingSafeEqual(Buffer.from(hash), Buffer.from(sha256(value)))
}

// A 6-digit code for email.
const newEmailCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

// "abcde-fghij": 10 letters and digits (about 50 bits), easy to read and type. Stored hashed.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
function newRecoveryCode() {
  const characters = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)])
  return `${characters.slice(0, 5).join('')}-${characters.slice(5).join('')}`
}
// Spaces, hyphens, and capitals as typed do not matter.
const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[\s-]/g, '')

function newRecoveryCodes() {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode)
  return { codes, hashes: codes.map((code) => sha256(normalizeRecoveryCode(code))) }
}

// "k•••@gmail.com", so the login screen can say where the code went without showing the address.
export function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 1)}•••@${domain}`
}

// What a submitted second step is: a 6-digit code, or a recovery code.
export type SecondStep = { code: string } | { recoveryCode: string }

export interface TwoFactorStatus {
  method: TwoFactorMethod | null
  enabledAt: Date | null
  recoveryCodesLeft: number
}

export async function twoFactorStatus(adminId: string): Promise<TwoFactorStatus> {
  const admin = await AdminUser.findById(adminId).lean()
  // Accounts created before two-step login existed have none of its fields stored (and .lean() does
  // not fill in the schema's defaults), so every field may be missing.
  return { method: admin?.twoFactorMethod ?? null, enabledAt: admin?.twoFactorEnabledAt ?? null, recoveryCodesLeft: admin?.recoveryCodeHashes?.length ?? 0 }
}

// --- Checking codes -------------------------------------------------------------------------------

// An app code for this admin. The step is recorded in the same update that checks it was not used,
// so the same code cannot log in twice even if sent twice at once. 'unavailable': the encryption key
// is not set (or changed), so the secret cannot be read; a recovery code still works.
async function useAppCode(adminId: unknown, sealedSecret: string | null | undefined, lastStep: number | null | undefined, code: string, key: Buffer | null) {
  if (!key || !sealedSecret) return 'unavailable' as const
  const secret = open(sealedSecret, key)
  if (!secret) return 'unavailable' as const
  const step = matchTotp(secret, code, lastStep ?? null)
  if (step === null) return false
  const updated = await AdminUser.updateOne({ _id: adminId, $or: [{ lastTotpStep: null }, { lastTotpStep: { $lt: step } }] }, { lastTotpStep: step })
  return updated.matchedCount === 1
}

// Removes the recovery code if it is one of the admin's unused ones: each works once. The code is in
// the condition, not only the removal: the automatic updatedAt makes every update count as a change.
async function useRecoveryCode(adminId: unknown, code: string) {
  const hash = sha256(normalizeRecoveryCode(code))
  const updated = await AdminUser.updateOne({ _id: adminId, recoveryCodeHashes: hash }, { $pull: { recoveryCodeHashes: hash } })
  return updated.matchedCount === 1
}

// --- Logging in -----------------------------------------------------------------------------------

// The password was right and the admin uses two-step login: a challenge for the code, replacing any
// earlier one for the account (so guesses cannot pile up across many open logins), and for email
// codes the code to send, while the hourly limit allows. Past the limit no email is sent and the
// last code sent carries over, so it still works within its 10 minutes. It carries the admin's
// credentialVersion, so a password change cancels it (services/adminAuth.ts).
export async function startLoginChallenge(admin: { _id: unknown, twoFactorMethod?: string | null, credentialVersion?: number | null }) {
  const token = randomBytes(32).toString('base64url')
  const earlier = await AdminLoginChallenge.findOne({ admin: admin._id, emailCodeHash: { $ne: null } }).sort({ emailCodeSentAt: -1 }).lean()
  await AdminLoginChallenge.deleteMany({ admin: admin._id })
  let emailCode: string | null = null
  let carried = {}
  if (admin.twoFactorMethod === 'email') {
    if (await takeHourly(admin._id, LOGIN_EMAILS)) emailCode = newEmailCode()
    else if (earlier) carried = { emailCodeHash: earlier.emailCodeHash, emailCodeSentAt: earlier.emailCodeSentAt, emailCodesSent: earlier.emailCodesSent }
  }
  await AdminLoginChallenge.create({
    tokenHash: sha256(token),
    admin: admin._id,
    credentialVersion: admin.credentialVersion ?? 0,
    expiresAt: minutesFromNow(CHALLENGE_MINUTES),
    ...(emailCode ? { emailCodeHash: sha256(emailCode), emailCodeSentAt: new Date(), emailCodesSent: 1 } : carried),
  })
  return { token, emailCode }
}

export type ChallengeResult =
  // method: the account's kind of code (app or email), for the security log.
  | { status: 'ok', admin: { _id: unknown, email: string, name: string, credentialVersion: number }, method: string, recoveryCodeUsed: boolean, recoveryCodesLeft: number }
  | { status: 'wrong', attemptsLeft: number }
  | { status: 'expired' }
  | { status: 'unavailable' }
  // Too many wrong 6-digit codes for the account this hour: only a recovery code works.
  | { status: 'codes-paused' }

// The account a login waiting for its code belongs to, for the security log; null if there is none.
export async function loginChallengeAdminId(token: string) {
  if (!token) return null
  const challenge = await AdminLoginChallenge.findOne({ tokenHash: sha256(token) }).select('admin').lean()
  return challenge ? String(challenge.admin) : null
}

// Checks the second step of a login. Each try is counted before the code is checked, so no more than
// MAX_CODE_ATTEMPTS codes can be tried for one login; the challenge is used up on success.
export async function completeLoginChallenge(token: string, step: SecondStep, key: Buffer | null): Promise<ChallengeResult> {
  if (!token) return { status: 'expired' }
  const challenge = await AdminLoginChallenge.findOneAndUpdate(
    { tokenHash: sha256(token), expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_CODE_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true },
  ).lean()
  if (!challenge) return { status: 'expired' }
  const admin = await AdminUser.findOne({ _id: challenge.admin, isActive: true }).lean()
  const credentialVersion = admin?.credentialVersion ?? 0
  // Checked before any code, so a recovery code sent to a cancelled login is not used up.
  if (!admin?.twoFactorMethod || (challenge.credentialVersion ?? 0) !== credentialVersion) {
    await AdminLoginChallenge.deleteOne({ _id: challenge._id })
    return { status: 'expired' }
  }
  if (!('recoveryCode' in step) && hourlyUsedUp(admin, WRONG_CODES)) return { status: 'codes-paused' }

  let passed: boolean | 'unavailable' = false
  if ('recoveryCode' in step) passed = await useRecoveryCode(admin._id, step.recoveryCode)
  else if (admin.twoFactorMethod === 'app') passed = await useAppCode(admin._id, admin.twoFactorSecret, admin.lastTotpStep, step.code, key)
  else if (challenge.emailCodeSentAt && challenge.emailCodeSentAt.getTime() > Date.now() - EMAIL_CODE_MINUTES * 60 * 1000) passed = sameHash(challenge.emailCodeHash, step.code)

  if (passed === 'unavailable') return { status: 'unavailable' }
  if (!passed) {
    if (!('recoveryCode' in step)) await takeHourly(admin._id, WRONG_CODES)
    const attemptsLeft = MAX_CODE_ATTEMPTS - challenge.attempts
    if (attemptsLeft <= 0) await AdminLoginChallenge.deleteOne({ _id: challenge._id })
    return { status: 'wrong', attemptsLeft }
  }
  // Used up at once, so it cannot complete a second login.
  const removed = await AdminLoginChallenge.deleteOne({ _id: challenge._id })
  if (removed.deletedCount !== 1) return { status: 'expired' }
  const stored = admin.recoveryCodeHashes?.length ?? 0
  const left = 'recoveryCode' in step ? stored - 1 : stored
  return { status: 'ok', admin: { _id: admin._id, email: admin.email, name: admin.name, credentialVersion }, method: admin.twoFactorMethod ?? '', recoveryCodeUsed: 'recoveryCode' in step, recoveryCodesLeft: left }
}

// A new emailed code for a login waiting on one. 'too-soon' within a minute of the last; null when the
// login has expired, uses an app, or has had its share of emails.
export async function resendLoginEmailCode(token: string) {
  if (!token) return null
  const challenge = await AdminLoginChallenge.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_CODE_ATTEMPTS } }).lean()
  if (!challenge) return null
  const admin = await AdminUser.findOne({ _id: challenge.admin, isActive: true, twoFactorMethod: 'email' }).lean()
  if (!admin) return null
  if (challenge.emailCodesSent >= MAX_EMAIL_CODES) return 'limit' as const
  if (challenge.emailCodeSentAt && challenge.emailCodeSentAt.getTime() > Date.now() - EMAIL_CODE_COOLDOWN_MS) return 'too-soon' as const
  if (!await takeHourly(admin._id, LOGIN_EMAILS)) return 'limit' as const
  const code = newEmailCode()
  // Conditional on the count read above, so two clicks at once send one email.
  const updated = await AdminLoginChallenge.updateOne(
    { _id: challenge._id, emailCodesSent: challenge.emailCodesSent },
    { emailCodeHash: sha256(code), emailCodeSentAt: new Date(), $inc: { emailCodesSent: 1 } },
  )
  if (updated.matchedCount !== 1) return 'too-soon' as const
  return { code, admin: { email: admin.email, name: admin.name } }
}

// --- Account security (a logged-in admin) ---------------------------------------------------------

// Starts setting up an authenticator app: a new secret, kept (encrypted) until the admin confirms
// a first code from the app. Returns what the app needs: the QR code's link and the typed key.
export async function startAppSetup(adminId: string, key: Buffer) {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true })
  if (!admin) return null
  const secret = newTotpSecret()
  admin.pendingTwoFactorSecret = seal(secret, key)
  admin.pendingTwoFactorExpiresAt = minutesFromNow(SETUP_MINUTES)
  await admin.save()
  return { secret: toBase32(secret), uri: otpauthUri(secret, ISSUER, admin.email) }
}

// Emails the logged-in admin a code: to set up email codes, or to confirm turning two-step login off
// or making new recovery codes. 'too-soon' within a minute of the last one. The minute is in the
// update's filter, so requests sent at once email one code (never sent: null, also on old accounts).
export async function createAccountEmailCode(adminId: string) {
  const code = newEmailCode()
  const admin = await AdminUser.findOneAndUpdate(
    { _id: adminId, isActive: true, $or: [{ accountCodeSentAt: null }, { accountCodeSentAt: { $lte: new Date(Date.now() - EMAIL_CODE_COOLDOWN_MS) } }] },
    { accountCodeHash: sha256(code), accountCodeExpiresAt: minutesFromNow(EMAIL_CODE_MINUTES), accountCodeAttempts: 0, accountCodeSentAt: new Date() },
    { new: true },
  ).lean()
  if (admin) return { code, admin: { email: admin.email, name: admin.name } }
  return (await AdminUser.exists({ _id: adminId, isActive: true })) ? 'too-soon' as const : null
}

// Checks an emailed account code. A right one is used up in the same update that finds it, so two
// requests sent at once with one code cannot both be approved (audit S4-M01). A wrong one counts a try,
// and after MAX_CODE_ATTEMPTS the code is cleared, only if it is still that code: a code emailed since
// is never cleared by a late request.
async function useAccountEmailCode(adminId: unknown, code: string) {
  const live = { _id: adminId, accountCodeExpiresAt: { $gt: new Date() }, accountCodeAttempts: { $lt: MAX_CODE_ATTEMPTS } }
  const used = await AdminUser.updateOne({ ...live, accountCodeHash: sha256(code) }, { accountCodeHash: null, accountCodeExpiresAt: null })
  if (used.matchedCount === 1) return true
  const counted = await AdminUser.findOneAndUpdate({ ...live, accountCodeHash: { $ne: null } }, { $inc: { accountCodeAttempts: 1 } }, { new: true }).lean()
  if (counted && counted.accountCodeAttempts >= MAX_CODE_ATTEMPTS) {
    await AdminUser.updateOne({ _id: adminId, accountCodeHash: counted.accountCodeHash }, { accountCodeHash: null, accountCodeExpiresAt: null })
  }
  return false
}

export type EnableResult = { status: 'ok', recoveryCodes: string[], sessionToken: string } | { status: 'wrong' } | { status: 'wrong-password' } | { status: 'not-started' } | { status: 'already-on' } | { status: 'changed' }

// Turns two-step login on once the admin proves it is them (the password: a session alone, such as a
// browser left logged in, must not be able to put someone else's phone on the account and lock its
// owner out) and that the method works (a first code from the app being set up, or the code just
// emailed). Gives ten new recovery codes (shown once) and ends everything logged in with the password
// alone (audit S2-M01): the account's credentialVersion goes up in the same update that turns it on, so
// a login whose password was checked just before is refused even if its session is saved afterwards,
// every session is deleted, and this browser gets a new one (sessionToken), so a copy of its old cookie
// stops working too. Saved only if the account is still as it was when the password was checked, with
// the same app setup waiting ('changed' otherwise; audit S3-M01): a password reset meanwhile clears the
// setup, and the copy read here must not be installed after it.
export async function enableTwoFactor(adminId: string, method: TwoFactorMethod, password: string, code: string, key: Buffer | null): Promise<EnableResult> {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true }).lean()
  if (!admin) return { status: 'not-started' }
  if (admin.twoFactorMethod) return { status: 'already-on' }

  let secret: string | null = null
  let lastTotpStep: number | null = null
  if (method === 'app') {
    if (!key || !admin.pendingTwoFactorSecret || !admin.pendingTwoFactorExpiresAt || admin.pendingTwoFactorExpiresAt < new Date()) return { status: 'not-started' }
    const pending = open(admin.pendingTwoFactorSecret, key)
    if (!pending) return { status: 'not-started' }
    if (!await verifyPassword(password, admin.passwordHash)) return { status: 'wrong-password' }
    const step = matchTotp(pending, code, null)
    if (step === null) return { status: 'wrong' }
    secret = admin.pendingTwoFactorSecret
    lastTotpStep = step
  } else {
    if (!admin.accountCodeHash || !admin.accountCodeExpiresAt || admin.accountCodeExpiresAt < new Date()) return { status: 'not-started' }
    // Before the code, so a wrong password does not use up the emailed code's tries.
    if (!await verifyPassword(password, admin.passwordHash)) return { status: 'wrong-password' }
    if (!await useAccountEmailCode(admin._id, code)) return { status: 'wrong' }
  }

  const { codes, hashes } = newRecoveryCodes()
  const sessionToken = await mongoose.connection.transaction(async (session) => {
    // Conditional on still being off, so two confirmations at once cannot both hand out codes.
    const expected = { _id: admin._id, twoFactorMethod: null, ...unchangedSince(admin), ...(method === 'app' ? { pendingTwoFactorSecret: secret } : {}) }
    const updated = await AdminUser.findOneAndUpdate(expected, {
      twoFactorMethod: method,
      twoFactorSecret: secret,
      twoFactorEnabledAt: new Date(),
      lastTotpStep,
      recoveryCodeHashes: hashes,
      pendingTwoFactorSecret: null,
      pendingTwoFactorExpiresAt: null,
      $inc: { credentialVersion: 1 },
    }, { new: true, session }).lean()
    if (!updated) return null
    await AdminSession.deleteMany({ admin: admin._id }, { session })
    return createSession(admin._id, updated.credentialVersion ?? 0, session)
  })
  if (sessionToken === null) return (await AdminUser.exists({ _id: admin._id, twoFactorMethod: { $ne: null } })) ? { status: 'already-on' } : { status: 'changed' }
  return { status: 'ok', recoveryCodes: codes, sessionToken }
}

export type VerifiedResult = { status: 'ok' } | { status: 'wrong-password' } | { status: 'wrong-code' } | { status: 'off' } | { status: 'changed' }

// Turning two-step login off and making new recovery codes need the password and a current second
// step (app code, emailed account code, or recovery code), so a browser left logged in is not enough.
// expected: what the account must still be when the change is saved (audit S3-M01): the same password,
// credentialVersion, and two-step method as when they were checked.
async function verifyAdmin(adminId: string, password: string, step: SecondStep, key: Buffer | null): Promise<{ status: 'ok', expected: Record<string, unknown> } | Exclude<VerifiedResult, { status: 'ok' }>> {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true }).lean()
  if (!admin?.twoFactorMethod) return { status: 'off' }
  if (!await verifyPassword(password, admin.passwordHash)) return { status: 'wrong-password' }
  let passed: boolean | 'unavailable' = false
  if ('recoveryCode' in step) passed = await useRecoveryCode(admin._id, step.recoveryCode)
  else if (admin.twoFactorMethod === 'app') passed = await useAppCode(admin._id, admin.twoFactorSecret, admin.lastTotpStep, step.code, key)
  else passed = await useAccountEmailCode(admin._id, step.code)
  if (passed !== true) return { status: 'wrong-code' }
  return { status: 'ok', expected: { _id: admin._id, twoFactorMethod: admin.twoFactorMethod, ...unchangedSince(admin) } }
}

export async function disableTwoFactor(adminId: string, password: string, step: SecondStep, key: Buffer | null): Promise<VerifiedResult> {
  const verified = await verifyAdmin(adminId, password, step, key)
  if (verified.status !== 'ok') return verified
  const { matchedCount } = await AdminUser.updateOne(verified.expected, { twoFactorMethod: null, twoFactorSecret: null, twoFactorEnabledAt: null, lastTotpStep: null, recoveryCodeHashes: [], accountCodeHash: null, accountCodeExpiresAt: null })
  return matchedCount === 1 ? { status: 'ok' } : { status: 'changed' }
}

// Ten new recovery codes; the old ones stop working.
export async function regenerateRecoveryCodes(adminId: string, password: string, step: SecondStep, key: Buffer | null) {
  const verified = await verifyAdmin(adminId, password, step, key)
  if (verified.status !== 'ok') return verified
  const { codes, hashes } = newRecoveryCodes()
  const { matchedCount } = await AdminUser.updateOne(verified.expected, { recoveryCodeHashes: hashes })
  return matchedCount === 1 ? { status: 'ok' as const, recoveryCodes: codes } : { status: 'changed' as const }
}
