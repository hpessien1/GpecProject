import { asFields, oneLineText } from './fields.js'
import type { ValidationErrors } from './fields.js'

// Only the hours can be changed: one line of text, which cannot be left empty.
export function validateCollectionHoursUpdate(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  for (const field of Object.keys(source)) if (field !== 'hours') errors[field] = `${field} is not an editable field.`
  const hours = oneLineText(source.hours, 120, 'hours', errors, true)
  // Text only: anything else (such as { $gt: '' }) is refused, not read as empty.
  if (Object.hasOwn(source, 'hours') && typeof source.hours !== 'string') errors.hours = 'hours must be text.'
  return { errors, value: { hours } }
}
