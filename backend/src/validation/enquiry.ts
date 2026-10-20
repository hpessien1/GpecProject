import { catalogue } from '../data/catalogue.js'
import type { CatalogueProduct } from '../data/catalogue.js'
import { asFields, emailPattern, text } from './fields.js'
import type { Fields, ValidationErrors } from './fields.js'

const productById = new Map(catalogue.map((product) => [product.id, product]))

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

  const uniqueItems = new Map<string, { product: CatalogueProduct, quantity: number }>()
  sourceItems.forEach((sourceItem) => {
    const item = sourceItem as Fields | null | undefined
    const productId = typeof item?.productId === 'string' ? item.productId : ''
    const quantity = Number(item?.quantity)
    const product = productById.get(productId)
    if (!product) {
      errors.items = 'One or more selected products are unavailable.'
      return
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      errors.items = 'Each product quantity must be between 1 and 1000.'
      return
    }
    uniqueItems.set(productId, { product, quantity: (uniqueItems.get(productId)?.quantity || 0) + quantity })
  })

  const items = [...uniqueItems.values()].map(({ product, quantity }) => ({ productId: product.id, name: product.name, reference: product.reference, quantity }))
  if (items.some((item) => item.quantity > 1000)) errors.items = 'Each product quantity must be between 1 and 1000.'
  return { errors, value: { customer, location, notes, items } }
}
