import { asFields, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

export function validateLogin(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const email = text(source.email, 254, 'email', errors, true).toLowerCase()
  // Passwords are not trimmed: spaces are part of the password. The length cap stops a huge password
  // from making the server spend time hashing it.
  const password = typeof source.password === 'string' ? source.password : ''
  if (!password) errors.password = 'password is required.'
  if (password.length > 200) errors.password = 'password must be 200 characters or fewer.'
  return { errors, value: { email, password } }
}

// NIST SP 800-63B: at least 15 characters when the password is the only login factor (no 2FA here),
// and no composition rules such as "must include a symbol".
export const MIN_PASSWORD_LENGTH = 15
const MAX_PASSWORD_LENGTH = 200

export function validatePasswordChange(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const currentPassword = typeof source.currentPassword === 'string' ? source.currentPassword : ''
  const newPassword = typeof source.newPassword === 'string' ? source.newPassword : ''
  if (!currentPassword) errors.currentPassword = 'Enter your current password.'
  if (currentPassword.length > MAX_PASSWORD_LENGTH) errors.currentPassword = `Passwords are at most ${MAX_PASSWORD_LENGTH} characters.`
  if (newPassword.length < MIN_PASSWORD_LENGTH) errors.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words make a strong, memorable password.`
  else if (newPassword.length > MAX_PASSWORD_LENGTH) errors.newPassword = `Use at most ${MAX_PASSWORD_LENGTH} characters.`
  else if (newPassword === currentPassword) errors.newPassword = 'Choose a password different from your current one.'
  return { errors, value: { currentPassword, newPassword } }
}
