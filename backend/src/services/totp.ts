import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Time-based one-time passwords (RFC 6238), the 6-digit codes authenticator apps such as Google
// Authenticator and Microsoft Authenticator show: HMAC-SHA1, a new code every 30 seconds. Built on
// Node's own crypto, so no extra package handles the secret.
const STEP_SECONDS = 30
const DIGITS = 6
// The code before and after the current one are accepted too, for a phone clock a little off.
const DRIFT_STEPS = 1
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// 20 random bytes (160 bits), the size RFC 4226 recommends for SHA-1.
export function newTotpSecret() {
  return randomBytes(20)
}

// The secret as admins type it into their app (Base32, no padding).
export function toBase32(bytes: Buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31]
  return output
}

// The link an authenticator app reads from the QR code: the issuer and account name label the entry.
export function otpauthUri(secret: Buffer, issuer: string, account: string) {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const query = new URLSearchParams({ secret: toBase32(secret), issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) })
  return `otpauth://totp/${label}?${query}`
}

export function totpCode(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac('sha1', secret).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0')
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS)

// The time step the code belongs to, or null if it matches none near now. A step at or before
// lastUsedStep is refused, so a code that was seen (over a shoulder, or in a log) cannot be used again.
export function matchTotp(secret: Buffer, code: string, lastUsedStep: number | null, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null
  const step = currentStep(now)
  let matched: number | null = null
  // Every candidate is checked, in constant time, whatever matched earlier.
  for (let candidate = step - DRIFT_STEPS; candidate <= step + DRIFT_STEPS; candidate++) {
    if (timingSafeEqual(Buffer.from(totpCode(secret, candidate)), Buffer.from(code)) && (lastUsedStep === null || candidate > lastUsedStep)) matched = candidate
  }
  return matched
}
