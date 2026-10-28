import { tidyPassword } from '../services/passwords.js'
import { asFields, emailPattern, text } from './fields.js'
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

// NIST SP 800-63B: at least 15 characters when the password is the only login factor (two-step login
// is optional, so it may be),
// and no composition rules such as "must include a symbol".
export const MIN_PASSWORD_LENGTH = 15
const MAX_PASSWORD_LENGTH = 200

// The same rule for a changed password and a reset one, on the password as it will be stored
// (tidyPassword), which is also what the breach check is given.
function newPasswordField(source: Record<string, unknown>, errors: ValidationErrors) {
  const newPassword = typeof source.newPassword === 'string' ? tidyPassword(source.newPassword) : ''
  if (newPassword.length < MIN_PASSWORD_LENGTH) errors.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words make a strong, memorable password.`
  else if (newPassword.length > MAX_PASSWORD_LENGTH) errors.newPassword = `Use at most ${MAX_PASSWORD_LENGTH} characters.`
  return newPassword
}

export function validatePasswordChange(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const currentPassword = typeof source.currentPassword === 'string' ? source.currentPassword : ''
  if (!currentPassword) errors.currentPassword = 'Enter your current password.'
  if (currentPassword.length > MAX_PASSWORD_LENGTH) errors.currentPassword = `Passwords are at most ${MAX_PASSWORD_LENGTH} characters.`
  const newPassword = newPasswordField(source, errors)
  if (!errors.newPassword && newPassword === tidyPassword(currentPassword)) errors.newPassword = 'Choose a password different from your current one.'
  return { errors, value: { currentPassword, newPassword } }
}

export function validatePasswordResetRequest(body: unknown) {
  const errors: ValidationErrors = {}
  const email = text(asFields(body).email, 254, 'email', errors, true).toLowerCase()
  if (email && !emailPattern.test(email)) errors.email = 'Enter a valid email address.'
  return { errors, value: { email } }
}

// The token from the emailed link: 32 random bytes in base64url (services/adminAuth.ts).
const RESET_TOKEN_PATTERN = /^[\w-]{43}$/

export function validatePasswordReset(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const token = typeof source.token === 'string' ? source.token : ''
  if (!RESET_TOKEN_PATTERN.test(token)) errors.token = 'This reset link is incomplete. Copy the whole link from the email, or ask for a new one.'
  const newPassword = newPasswordField(source, errors)
  return { errors, value: { token, newPassword } }
}
