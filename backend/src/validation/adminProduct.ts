import { PRODUCT_STATUSES } from '../models/Product.js'
import { PRODUCT_IMAGE_KEY_PATTERN } from '../services/productImages.js'
import { asFields, text } from './fields.js'
import type { Fields, ValidationErrors } from './fields.js'

export const PRODUCT_ID_PATTERN = /^[a-z0-9-]{1,60}$/
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/
// An image is a file already on the site (frontend/public/assets/) or an uploaded photo
// (product-images/<hash>.webp, services/productImages.ts).
const SITE_IMAGE_PATTERN = /^\/assets\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/
// In the smallest currency unit: 10^12 kobo is 10 billion naira, far above any real product.
const MAX_PRICE = 1_000_000_000_000

const EDITABLE_FIELDS = ['name', 'reference', 'description', 'specs', 'image', 'alt', 'price', 'isPlaceholder', 'status', 'sortOrder'] as const
const REQUIRED_ON_CREATE = ['id', 'name', 'reference', 'description', 'image', 'alt'] as const

export interface ProductChanges {
  name?: string
  reference?: string
  description?: string
  specs?: string[]
  image?: string
  alt?: string
  price?: number | null
  isPlaceholder?: boolean
  status?: typeof PRODUCT_STATUSES[number]
  sortOrder?: number
}

// Each field is checked only if present. Types must match exactly (no "12" for 12), so nothing an
// attacker sends, such as { $gt: '' }, reaches the database as an operator.
function readEditableFields(source: Fields, errors: ValidationErrors): ProductChanges {
  const value: ProductChanges = {}
  const has = (field: string) => Object.hasOwn(source, field)

  if (has('name')) value.name = text(source.name, 120, 'name', errors, true)
  if (has('reference')) {
    value.reference = text(source.reference, 40, 'reference', errors, true)
    if (value.reference && !REFERENCE_PATTERN.test(value.reference)) errors.reference = 'reference may use letters, digits, and . _ / - only.'
  }
  if (has('description')) value.description = text(source.description, 1000, 'description', errors, true)
  if (has('alt')) value.alt = text(source.alt, 300, 'alt', errors, true)
  if (has('image')) {
    value.image = text(source.image, 300, 'image', errors, true)
    if (value.image && !SITE_IMAGE_PATTERN.test(value.image) && !PRODUCT_IMAGE_KEY_PATTERN.test(value.image)) errors.image = 'image must be an uploaded photo or a file in /assets/, such as /assets/product.png.'
  }
  if (has('specs')) {
    const specs = Array.isArray(source.specs) ? source.specs : null
    if (!specs || specs.length > 10 || specs.some((spec) => typeof spec !== 'string' || !spec.trim() || spec.trim().length > 80)) {
      errors.specs = 'specs must be a list of up to 10 entries, each 1 to 80 characters.'
    } else {
      value.specs = specs.map((spec) => String(spec).trim())
    }
  }
  if (has('price')) {
    const price = source.price
    if (price === null || (typeof price === 'number' && Number.isInteger(price) && price >= 0 && price <= MAX_PRICE)) value.price = price
    else errors.price = 'price must be empty or a whole number of the smallest currency unit (e.g. kobo).'
  }
  if (has('isPlaceholder')) {
    if (typeof source.isPlaceholder === 'boolean') value.isPlaceholder = source.isPlaceholder
    else errors.isPlaceholder = 'isPlaceholder must be true or false.'
  }
  if (has('status')) {
    const status = PRODUCT_STATUSES.find((option) => option === source.status)
    if (status) value.status = status
    else errors.status = `status must be one of: ${PRODUCT_STATUSES.join(', ')}.`
  }
  if (has('sortOrder')) {
    const sortOrder = source.sortOrder
    if (typeof sortOrder === 'number' && Number.isInteger(sortOrder) && Math.abs(sortOrder) <= 1_000_000) value.sortOrder = sortOrder
    else errors.sortOrder = 'sortOrder must be a whole number.'
  }
  return value
}

function rejectUnknownFields(source: Fields, allowed: readonly string[], errors: ValidationErrors) {
  for (const field of Object.keys(source)) {
    if (!allowed.includes(field)) errors[field] = field === 'id' ? 'id cannot be changed.' : `${field} is not an editable field.`
  }
}

export function validateProductCreate(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  rejectUnknownFields(source, ['id', ...EDITABLE_FIELDS], errors)
  for (const field of REQUIRED_ON_CREATE) if (!Object.hasOwn(source, field)) errors[field] = `${field} is required.`
  const id = text(source.id, 60, 'id', errors, true)
  if (id && !PRODUCT_ID_PATTERN.test(id)) errors.id = 'id may use lowercase letters, digits, and hyphens only (e.g. panel-002).'
  return { errors, value: { id, ...readEditableFields(source, errors) } }
}

export function validateProductUpdate(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  rejectUnknownFields(source, EDITABLE_FIELDS, errors)
  const value = readEditableFields(source, errors)
  if (Object.keys(source).length === 0) errors.body = 'Send at least one field to change.'
  return { errors, value }
}
