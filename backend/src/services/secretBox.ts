import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Encrypts a small secret (an admin's authenticator-app secret) for storage, with AES-256-GCM and the
// TWO_FACTOR_ENCRYPTION_KEY setting, so a copy of the database alone cannot be used to make codes.
// Stored as "v1.<iv>.<tag>.<ciphertext>" in base64url; GCM's tag makes any tampering fail to decrypt.
const VERSION = 'v1'

export function seal(plaintext: Buffer, key: Buffer) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((part) => typeof part === 'string' ? part : part.toString('base64url')).join('.')
}

// null when the value was sealed with another key, or changed.
export function open(sealed: string, key: Buffer): Buffer | null {
  const [version, iv, tag, ciphertext] = sealed.split('.')
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()])
  } catch {
    return null
  }
}
