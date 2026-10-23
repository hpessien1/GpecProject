import { DELIVERY_AREA_STATUSES } from '../models/DeliveryArea.js'
import { asFields, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

// In the smallest currency unit: 10^10 kobo is 100 million naira, far above any delivery fee.
const MAX_FEE = 10_000_000_000
const EDITABLE_FIELDS = ['name', 'description', 'fee', 'status', 'sortOrder'] as const
const REQUIRED_ON_CREATE = ['name', 'fee'] as const

export interface DeliveryAreaChanges {
  name?: string
  description?: string
  fee?: number
  status?: typeof DELIVERY_AREA_STATUSES[number]
  sortOrder?: number
}

// Areas use MongoDB's own IDs: 24 lowercase hexadecimal characters.
export function isDeliveryAreaId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{24}$/.test(value)
}

// Each field is checked only if present, with exact types (no "1500" for 1500).
function readFields(source: Record<string, unknown>, errors: ValidationErrors) {
  const value: DeliveryAreaChanges = {}
  const has = (field: string) => Object.hasOwn(source, field)
  for (const field of Object.keys(source)) if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) errors[field] = `${field} is not an editable field.`
  if (has('name')) value.name = text(source.name, 120, 'name', errors, true)
  if (has('description')) value.description = text(source.description, 300, 'description', errors)
  if (has('fee')) {
    const fee = source.fee
    if (typeof fee === 'number' && Number.isInteger(fee) && fee >= 0 && fee <= MAX_FEE) value.fee = fee
    else errors.fee = 'fee must be a whole number of the smallest currency unit (e.g. kobo), 0 for free delivery.'
  }
  if (has('status')) {
    const status = DELIVERY_AREA_STATUSES.find((option) => option === source.status)
    if (status) value.status = status
    else errors.status = `status must be one of: ${DELIVERY_AREA_STATUSES.join(', ')}.`
  }
  if (has('sortOrder')) {
    const sortOrder = source.sortOrder
    if (typeof sortOrder === 'number' && Number.isInteger(sortOrder) && Math.abs(sortOrder) <= 1_000_000) value.sortOrder = sortOrder
    else errors.sortOrder = 'sortOrder must be a whole number.'
  }
  return value
}

export function validateDeliveryAreaCreate(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  for (const field of REQUIRED_ON_CREATE) if (!Object.hasOwn(source, field)) errors[field] = `${field} is required.`
  return { errors, value: readFields(source, errors) }
}

export function validateDeliveryAreaUpdate(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const value = readFields(source, errors)
  if (Object.keys(source).length === 0) errors.body = 'Send at least one field to change.'
  return { errors, value }
}
