import { REQUEST_STATUSES } from '../models/requestStatus.js'
import type { RequestStatus } from '../models/requestStatus.js'
import { asFields, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

// Customer-facing references (utils/reference.ts), e.g. GPEC-C-2026-1A2B3C4D.
export const REFERENCE_PATTERNS = {
  contactRequest: /^GPEC-C-\d{4}-[0-9A-F]{8}$/,
}

function readStatus(value: unknown): RequestStatus | undefined {
  return REQUEST_STATUSES.find((status) => status === value)
}

// ?page=2&status=new&q=acme — all optional. q is plain text matched against the reference and the
// customer's name, company, and email; a repeated or non-text q counts as empty. Unknown query
// parameters are ignored.
export function validateRequestListQuery(query: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(query)
  const page = source.page === undefined ? 1 : Number(source.page)
  if (!Number.isInteger(page) || page < 1 || page > 10_000) errors.page = 'page must be a whole number from 1.'
  const status = source.status === undefined ? null : readStatus(source.status) ?? null
  if (source.status !== undefined && !status) errors.status = `status must be one of: ${REQUEST_STATUSES.join(', ')}.`
  const search = text(source.q, 100, 'q', errors)
  return { errors, value: { page, status, search } }
}

// { text } and nothing else.
export function validateNote(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  for (const field of Object.keys(source)) if (field !== 'text') errors[field] = `${field} is not allowed.`
  const note = text(source.text, 2000, 'text', errors, true)
  return { errors, value: { text: note } }
}

// { status } and nothing else: a request's customer details are never edited by admins.
export function validateStatusChange(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  for (const field of Object.keys(source)) if (field !== 'status') errors[field] = `${field} cannot be changed.`
  const status = readStatus(source.status)
  if (!status) errors.status = `status must be one of: ${REQUEST_STATUSES.join(', ')}.`
  return { errors, value: { status: status ?? 'new' } }
}
