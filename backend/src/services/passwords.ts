import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'

// scrypt (built into Node, so no extra dependency) at OWASP's recommended minimum cost (N=2^17, r=8,
// p=1): about a quarter of a second per check, which slows password guessing. Unlike bcrypt it uses
// the whole password, with no 72-byte cut-off. The settings are stored in each hash, so they can be
// raised later without breaking existing passwords.
const COST = 2 ** 17
const BLOCK_SIZE = 8
const PARALLELISM = 1
const KEY_LENGTH = 64
const MAX_MEMORY = 256 * 1024 * 1024

// The one form a password is checked and stored in: Unicode NFKC, which makes look-alike characters
// ordinary (the full-width "ｐａｓｓ" some keyboards type becomes "pass"), so a password logs in however
// the keyboard typed it. Every rule on a new password (length, breach check, different from the
// current one) looks at this form, the one actually stored (audit L-03). Passwords stored before
// 2026-10-28 were hashed in this form already.
export const tidyPassword = (password: string) => password.normalize('NFKC')

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(tidyPassword(password), salt, KEY_LENGTH, { ...options, maxmem: MAX_MEMORY }, (error, key) => error ? reject(error) : resolve(key))
  })
}

// Format: scrypt$N$r$p$salt$hash (salt and hash in base64url).
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, { N: COST, r: BLOCK_SIZE, p: PARALLELISM })
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, cost, blockSize, parallelism, salt, hash] = storedHash.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const key = await derive(password, Buffer.from(salt, 'base64url'), { N: Number(cost), r: Number(blockSize), p: Number(parallelism) })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Checked against when no account matches the email, so an unknown email takes as long to reject as
// a wrong password and response times do not reveal which emails are admins.
let decoyHash: Promise<string> | undefined
export function getDecoyHash() {
  decoyHash ??= hashPassword(randomBytes(16).toString('hex'))
  return decoyHash
}

// A random password for a new or reset admin account, shown once by scripts/createAdmin.ts.
export function generatePassword() {
  return randomBytes(18).toString('base64url')
}
