import { asFields, emailPattern, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

// Only the reply-to address can be changed, and it cannot be left empty.
export function validateCustomerEmailUpdate(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  for (const field of Object.keys(source)) if (field !== 'replyTo') errors[field] = `${field} is not an editable field.`
  const replyTo = text(source.replyTo, 254, 'replyTo', errors, true).toLowerCase()
  if (replyTo && !errors.replyTo && !emailPattern.test(replyTo)) errors.replyTo = 'replyTo must be a valid email address.'
  // Text only: anything else (such as { $gt: '' }) is refused, not read as empty.
  if (Object.hasOwn(source, 'replyTo') && typeof source.replyTo !== 'string') errors.replyTo = 'replyTo must be text.'
  return { errors, value: { replyTo } }
}
