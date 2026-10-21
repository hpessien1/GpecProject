// Shared helpers for validating untrusted request bodies: read fields as unknown and narrow each one.
export type Fields = Record<string, unknown>
export type ValidationErrors = Record<string, string>

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function asFields(value: unknown): Fields {
  return (value && typeof value === 'object' ? value : {}) as Fields
}

// Only a string survives; anything else (numbers, objects such as { $gt: '' }) becomes ''.
export function text(value: unknown, maxLength: number, field: string, errors: ValidationErrors, required = false) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (required && !normalized) errors[field] = `${field} is required.`
  if (normalized.length > maxLength) errors[field] = `${field} must be ${maxLength} characters or fewer.`
  return normalized
}

// Spam trap: the public forms include a "website" field that people never see (hidden off-screen and
// skipped by keyboard and screen readers). Automated scripts tend to fill every field, so a value here
// means the submission is very likely spam.
export const HONEYPOT_FIELD = 'website'

export function isLikelySpam(body: unknown) {
  const value = asFields(body)[HONEYPOT_FIELD]
  // Absent or empty is normal. Anything else (text, or a non-string such as an object) is not.
  return value !== undefined && (typeof value !== 'string' || value.trim() !== '')
}
