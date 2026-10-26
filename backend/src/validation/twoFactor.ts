import type { SecondStep, TwoFactorMethod } from '../services/twoFactor.js'
import { asFields } from './fields.js'
import type { ValidationErrors } from './fields.js'

const CODE_MESSAGE = 'Enter the 6-digit code.'
const RECOVERY_MESSAGE = 'Enter one of your recovery codes, like abcde-fghij.'

function rejectUnknown(source: Record<string, unknown>, allowed: readonly string[], errors: ValidationErrors) {
  for (const field of Object.keys(source)) if (!allowed.includes(field)) errors[field] = `${field} is not an accepted field.`
}

// "123 456" as typed is fine; anything but six digits is not.
function sixDigits(value: unknown, errors: ValidationErrors) {
  const code = typeof value === 'string' ? value.replace(/\s/g, '') : ''
  if (!/^\d{6}$/.test(code)) errors.code = CODE_MESSAGE
  return code
}

// A 6-digit code, or a recovery code instead: exactly one of the two.
function secondStep(source: Record<string, unknown>, errors: ValidationErrors): SecondStep {
  const hasCode = Object.hasOwn(source, 'code')
  const hasRecovery = Object.hasOwn(source, 'recoveryCode')
  if (hasCode === hasRecovery) {
    errors.code = hasCode ? 'Send a code or a recovery code, not both.' : CODE_MESSAGE
    return { code: '' }
  }
  if (hasCode) return { code: sixDigits(source.code, errors) }
  const recoveryCode = typeof source.recoveryCode === 'string' ? source.recoveryCode.trim() : ''
  // 10 letters and digits, with the hyphen or spaces people type.
  if (!/^[A-Za-z0-9][A-Za-z0-9\s-]{8,20}[A-Za-z0-9]$/.test(recoveryCode)) errors.recoveryCode = RECOVERY_MESSAGE
  return { recoveryCode }
}

// The second step of a login.
export function validateLoginCode(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  rejectUnknown(source, ['code', 'recoveryCode'], errors)
  return { errors, value: secondStep(source, errors) }
}

function currentPassword(value: unknown, errors: ValidationErrors) {
  const password = typeof value === 'string' ? value : ''
  if (!password) errors.password = 'Enter your password.'
  else if (password.length > 200) errors.password = 'Passwords are at most 200 characters.'
  return password
}

// Turning two-step login on: the method, its first code, and the password.
export function validateEnable(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  rejectUnknown(source, ['method', 'password', 'code'], errors)
  const method = source.method === 'app' || source.method === 'email' ? source.method as TwoFactorMethod : null
  if (!method) errors.method = 'method must be app or email.'
  return { errors, value: { method: method ?? 'app', password: currentPassword(source.password, errors), code: sixDigits(source.code, errors) } }
}

// Turning it off, or new recovery codes: the password and a current second step.
export function validateVerifiedAction(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  rejectUnknown(source, ['password', 'code', 'recoveryCode'], errors)
  return { errors, value: { password: currentPassword(source.password, errors), step: secondStep(source, errors) } }
}
