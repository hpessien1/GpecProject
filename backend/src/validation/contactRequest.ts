import { asFields, emailPattern, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

// Must match the options in the landing-page contact form (frontend/src/data/landingContent.ts): one
// per business area, plus "Other inquiry". Requests saved under an older topic keep it.
export const contactSubjects = [
  'Electrical panels',
  'Solar energy',
  'Electrical products',
  'Solar products',
  'Solar accessories',
  'Electrical accessories',
  'Electronics',
  'Industrial products',
  'Industrial accessories',
  'Other inquiry',
]

export function validateContactRequest(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const value = {
    fullName: text(source.fullName, 120, 'fullName', errors, true),
    company: text(source.company, 120, 'company', errors),
    email: text(source.email, 254, 'email', errors, true).toLowerCase(),
    phone: text(source.phone, 40, 'phone', errors),
    subject: text(source.subject, 60, 'subject', errors),
    message: text(source.message, 5000, 'message', errors, true),
  }

  if (value.email && !emailPattern.test(value.email)) errors.email = 'email must be valid.'
  if (value.subject && !contactSubjects.includes(value.subject)) errors.subject = 'subject must be one of the listed options.'
  return { errors, value }
}
