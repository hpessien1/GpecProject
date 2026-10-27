import mongoose from 'mongoose'
import { asFields } from './fields.js'
import type { ValidationErrors } from './fields.js'
import { validateOlderPageQuery } from './olderPage.js'

// ?before=<cursor> for an older page (as for histories), and ?account=<admin ID> for one account's
// entries only. Unknown query parameters are ignored.
export function validateSecurityLogQuery(query: unknown) {
  const { errors, value: { before } } = validateOlderPageQuery(query)
  const failures: ValidationErrors = { ...errors }
  const { account } = asFields(query)
  let adminId: string | null = null
  if (account !== undefined) {
    if (typeof account === 'string' && /^[0-9a-f]{24}$/.test(account) && mongoose.isObjectIdOrHexString(account)) adminId = account
    else failures.account = 'account must be an admin account’s ID.'
  }
  return { errors: failures, value: { before, adminId } }
}
