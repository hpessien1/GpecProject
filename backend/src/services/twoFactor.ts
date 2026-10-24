import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import AdminLoginChallenge from '../models/AdminLoginChallenge.js'
import AdminSession from '../models/AdminSession.js'
import AdminUser from '../models/AdminUser.js'
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
// An app being set up must be confirmed within this time.
const SETUP_MINUTES = 15
const ISSUER = 'GPEC Admin'

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000)
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

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

// The password was right and the admin uses two-step login: a challenge for the code, and for email
// codes the first code to send.
export async function startLoginChallenge(admin: { _id: unknown, twoFactorMethod?: string | null }) {
  const token = randomBytes(32).toString('base64url')
  const emailCode = admin.twoFactorMethod === 'email' ? newEmailCode() : null
  await AdminLoginChallenge.create({
    tokenHash: sha256(token),
    admin: admin._id,
    expiresAt: minutesFromNow(CHALLENGE_MINUTES),
    ...(emailCode ? { emailCodeHash: sha256(emailCode), emailCodeSentAt: new Date(), emailCodesSent: 1 } : {}),
  })
  return { token, emailCode }
}

export type ChallengeResult =
  | { status: 'ok', admin: { _id: unknown, email: string, name: string }, recoveryCodeUsed: boolean, recoveryCodesLeft: number }
  | { status: 'wrong', attemptsLeft: number }
  | { status: 'expired' }
  | { status: 'unavailable' }

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
  if (!admin?.twoFactorMethod) {
    await AdminLoginChallenge.deleteOne({ _id: challenge._id })
    return { status: 'expired' }
  }

  let passed: boolean | 'unavailable' = false
  if ('recoveryCode' in step) passed = await useRecoveryCode(admin._id, step.recoveryCode)
  else if (admin.twoFactorMethod === 'app') passed = await useAppCode(admin._id, admin.twoFactorSecret, admin.lastTotpStep, step.code, key)
  else if (challenge.emailCodeSentAt && challenge.emailCodeSentAt.getTime() > Date.now() - EMAIL_CODE_MINUTES * 60 * 1000) passed = sameHash(challenge.emailCodeHash, step.code)

  if (passed === 'unavailable') return { status: 'unavailable' }
  if (!passed) {
    const attemptsLeft = MAX_CODE_ATTEMPTS - challenge.attempts
    if (attemptsLeft <= 0) await AdminLoginChallenge.deleteOne({ _id: challenge._id })
    return { status: 'wrong', attemptsLeft }
  }
  // Used up at once, so it cannot complete a second login.
  const removed = await AdminLoginChallenge.deleteOne({ _id: challenge._id })
  if (removed.deletedCount !== 1) return { status: 'expired' }
  const stored = admin.recoveryCodeHashes?.length ?? 0
  const left = 'recoveryCode' in step ? stored - 1 : stored
  return { status: 'ok', admin: { _id: admin._id, email: admin.email, name: admin.name }, recoveryCodeUsed: 'recoveryCode' in step, recoveryCodesLeft: left }
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
// or making new recovery codes. 'too-soon' within a minute of the last one.
export async function createAccountEmailCode(adminId: string) {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true })
  if (!admin) return null
  if (admin.accountCodeSentAt && admin.accountCodeSentAt.getTime() > Date.now() - EMAIL_CODE_COOLDOWN_MS) return 'too-soon' as const
  const code = newEmailCode()
  admin.accountCodeHash = sha256(code)
  admin.accountCodeExpiresAt = minutesFromNow(EMAIL_CODE_MINUTES)
  admin.accountCodeAttempts = 0
  admin.accountCodeSentAt = new Date()
  await admin.save()
  return { code, admin: { email: admin.email, name: admin.name } }
}

// Checks an emailed account code; each try counts, and the code is cleared once used or after
// MAX_CODE_ATTEMPTS wrong tries.
async function useAccountEmailCode(adminId: unknown, code: string) {
  const admin = await AdminUser.findOneAndUpdate(
    { _id: adminId, accountCodeHash: { $ne: null }, accountCodeExpiresAt: { $gt: new Date() }, accountCodeAttempts: { $lt: MAX_CODE_ATTEMPTS } },
    { $inc: { accountCodeAttempts: 1 } },
    { new: true },
  ).lean()
  if (!admin) return false
  const passed = sameHash(admin.accountCodeHash, code)
  if (passed || admin.accountCodeAttempts >= MAX_CODE_ATTEMPTS) await AdminUser.updateOne({ _id: adminId }, { accountCodeHash: null, accountCodeExpiresAt: null })
  return passed
}

export type EnableResult = { status: 'ok', recoveryCodes: string[] } | { status: 'wrong' } | { status: 'not-started' } | { status: 'already-on' }

// Turns two-step login on once the admin proves the method works: a first code from the app being set
// up, or the code just emailed. Gives ten new recovery codes (shown once) and ends the admin's other
// sessions, which were logged in with the password alone.
export async function enableTwoFactor(adminId: string, method: TwoFactorMethod, code: string, key: Buffer | null, currentSessionToken: string): Promise<EnableResult> {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true }).lean()
  if (!admin) return { status: 'not-started' }
  if (admin.twoFactorMethod) return { status: 'already-on' }

  let secret: string | null = null
  let lastTotpStep: number | null = null
  if (method === 'app') {
    if (!key || !admin.pendingTwoFactorSecret || !admin.pendingTwoFactorExpiresAt || admin.pendingTwoFactorExpiresAt < new Date()) return { status: 'not-started' }
    const pending = open(admin.pendingTwoFactorSecret, key)
    if (!pending) return { status: 'not-started' }
    const step = matchTotp(pending, code, null)
    if (step === null) return { status: 'wrong' }
    secret = admin.pendingTwoFactorSecret
    lastTotpStep = step
  } else {
    if (!admin.accountCodeHash || !admin.accountCodeExpiresAt || admin.accountCodeExpiresAt < new Date()) return { status: 'not-started' }
    if (!await useAccountEmailCode(admin._id, code)) return { status: 'wrong' }
  }

  const { codes, hashes } = newRecoveryCodes()
  // Conditional on still being off, so two confirmations at once cannot both hand out codes.
  const updated = await AdminUser.updateOne({ _id: admin._id, twoFactorMethod: null }, {
    twoFactorMethod: method,
    twoFactorSecret: secret,
    twoFactorEnabledAt: new Date(),
    lastTotpStep,
    recoveryCodeHashes: hashes,
    pendingTwoFactorSecret: null,
    pendingTwoFactorExpiresAt: null,
  })
  if (updated.matchedCount !== 1) return { status: 'already-on' }
  await AdminSession.deleteMany({ admin: admin._id, tokenHash: { $ne: sha256(currentSessionToken) } })
  return { status: 'ok', recoveryCodes: codes }
}

export type VerifiedResult = { status: 'ok' } | { status: 'wrong-password' } | { status: 'wrong-code' } | { status: 'off' }

// Turning two-step login off and making new recovery codes need the password and a current second
// step (app code, emailed account code, or recovery code), so a browser left logged in is not enough.
async function verifyAdmin(adminId: string, password: string, step: SecondStep, key: Buffer | null): Promise<VerifiedResult> {
  const admin = await AdminUser.findOne({ _id: adminId, isActive: true }).lean()
  if (!admin?.twoFactorMethod) return { status: 'off' }
  if (!await verifyPassword(password, admin.passwordHash)) return { status: 'wrong-password' }
  let passed: boolean | 'unavailable' = false
  if ('recoveryCode' in step) passed = await useRecoveryCode(admin._id, step.recoveryCode)
  else if (admin.twoFactorMethod === 'app') passed = await useAppCode(admin._id, admin.twoFactorSecret, admin.lastTotpStep, step.code, key)
  else passed = await useAccountEmailCode(admin._id, step.code)
  return passed === true ? { status: 'ok' } : { status: 'wrong-code' }
}

export async function disableTwoFactor(adminId: string, password: string, step: SecondStep, key: Buffer | null) {
  const verified = await verifyAdmin(adminId, password, step, key)
  if (verified.status !== 'ok') return verified
  await AdminUser.updateOne({ _id: adminId }, { twoFactorMethod: null, twoFactorSecret: null, twoFactorEnabledAt: null, lastTotpStep: null, recoveryCodeHashes: [], accountCodeHash: null, accountCodeExpiresAt: null })
  return verified
}

// Ten new recovery codes; the old ones stop working.
export async function regenerateRecoveryCodes(adminId: string, password: string, step: SecondStep, key: Buffer | null) {
  const verified = await verifyAdmin(adminId, password, step, key)
  if (verified.status !== 'ok') return verified
  const { codes, hashes } = newRecoveryCodes()
  await AdminUser.updateOne({ _id: adminId }, { recoveryCodeHashes: hashes })
  return { status: 'ok' as const, recoveryCodes: codes }
}
