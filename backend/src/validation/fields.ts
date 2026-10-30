// Shared helpers for validating untrusted request bodies: read fields as unknown and narrow each one.
export type Fields = Record<string, unknown>
export type ValidationErrors = Record<string, string>

// After the @, only a domain: labels of letters, digits, and inner hyphens, joined by dots. `?`, `&`,
// `%`, or `#` there would add recipients to staff's "email the customer" link (audit S4-L01); the links
// encode the address as well, for addresses saved before this rule.
const domainLabel = '[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]*[\\p{L}\\p{N}])?'
export const emailPattern = new RegExp(`^[^\\s@]+@(?:${domainLabel}\\.)+${domainLabel}$`, 'u')

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

// A line break of any kind: CR, LF, vertical tab, form feed, NEL, and Unicode's line and paragraph
// separators.
export const LINE_BREAK = /[\n\v\f\r\u0085\u2028\u2029]/

// text() for a one-line detail (a name, a company, a phone number): a line break is refused, so it
// cannot add lines of its own to the emails it appears in (audit S5-L01).
export function oneLineText(value: unknown, maxLength: number, field: string, errors: ValidationErrors, required = false) {
  const normalized = text(value, maxLength, field, errors, required)
  if (LINE_BREAK.test(normalized)) errors[field] = `${field} must be on one line.`
  return normalized
}

// ?page= on the admin lists: a whole number from 1, or 1 when absent.
export function pageNumber(value: unknown, errors: ValidationErrors) {
  const page = value === undefined ? 1 : Number(value)
  if (!Number.isInteger(page) || page < 1 || page > 10_000) errors.page = 'page must be a whole number from 1.'
  return page
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
