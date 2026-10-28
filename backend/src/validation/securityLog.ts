import mongoose from 'mongoose'
import { asFields, pageNumber } from './fields.js'
import type { ValidationErrors } from './fields.js'

// A moment as the browser sends it (Date's toISOString, or with an offset), e.g. 2026-10-27T23:00:00.000Z.
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

function instant(value: unknown, field: string, errors: ValidationErrors) {
  if (value === undefined) return null
  const time = typeof value === 'string' && INSTANT_PATTERN.test(value) ? Date.parse(value) : Number.NaN
  if (Number.isNaN(time)) {
    errors[field] = `${field} must be a date and time such as 2026-10-27T23:00:00.000Z.`
    return null
  }
  return new Date(time)
}

// ?page=2 for a numbered page, ?account=<admin ID> for one account's entries only, and ?from= and ?to=
// for the entries from one moment (included) up to another (not included). The site sends the start of
// the first day and the start of the day after the last, on the admin's own calendar, as the entries'
// times are shown on it. Unknown query parameters are ignored.
export function validateSecurityLogQuery(query: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(query)
  const page = pageNumber(source.page, errors)
  let adminId: string | null = null
  if (source.account !== undefined) {
    if (typeof source.account === 'string' && /^[0-9a-f]{24}$/.test(source.account) && mongoose.isObjectIdOrHexString(source.account)) adminId = source.account
    else errors.account = 'account must be an admin account’s ID.'
  }
  const from = instant(source.from, 'from', errors)
  const to = instant(source.to, 'to', errors)
  if (from && to && to <= from) errors.to = 'to must be later than from.'
  return { errors, value: { page, adminId, from, to } }
}
