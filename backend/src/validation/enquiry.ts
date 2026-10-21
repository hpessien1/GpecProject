import { asFields, emailPattern, text } from './fields.js'
import type { Fields, ValidationErrors } from './fields.js'

export const UNAVAILABLE_PRODUCTS = 'One or more selected products are unavailable.'

// Checks the shape of an enquiry. Items come back as product IDs and merged quantities only; the
// route looks each ID up in the database (names and references are never taken from the client).
export function validateEnquiry(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const customerSource = asFields(source.customer)
  const customer = {
    fullName: text(customerSource.fullName, 120, 'fullName', errors, true),
    company: text(customerSource.company, 120, 'company', errors),
    email: text(customerSource.email, 254, 'email', errors, true).toLowerCase(),
    phone: text(customerSource.phone, 40, 'phone', errors, true),
  }

  if (customer.email && !emailPattern.test(customer.email)) errors.email = 'email must be valid.'
  const location = text(source.location, 180, 'location', errors)
  const notes = text(source.notes, 5000, 'notes', errors)
  const sourceItems: unknown[] = Array.isArray(source.items) ? source.items : []
  if (sourceItems.length === 0) errors.items = 'At least one product is required.'
  if (sourceItems.length > 50) errors.items = 'A maximum of 50 product types is allowed per enquiry.'

  const quantities = new Map<string, number>()
  sourceItems.forEach((sourceItem) => {
    const item = sourceItem as Fields | null | undefined
    // Only a string survives, so an object such as { $ne: '' } cannot reach the database query.
    const productId = typeof item?.productId === 'string' ? item.productId.trim() : ''
    const quantity = Number(item?.quantity)
    if (!productId || productId.length > 60) {
      errors.items = UNAVAILABLE_PRODUCTS
      return
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      errors.items = 'Each product quantity must be between 1 and 1000.'
      return
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity)
  })

  const items = [...quantities].map(([productId, quantity]) => ({ productId, quantity }))
  if (items.some((item) => item.quantity > 1000)) errors.items = 'Each product quantity must be between 1 and 1000.'
  return { errors, value: { customer, location, notes, items } }
}
