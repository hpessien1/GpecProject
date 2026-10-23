import { asFields, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

const EDITABLE_FIELDS = ['enabled', 'bankName', 'accountName', 'accountNumber', 'instructions', 'payWithinDays'] as const

export interface BankTransferChanges {
  enabled?: boolean
  bankName?: string
  accountName?: string
  accountNumber?: string
  instructions?: string
  payWithinDays?: number
}

// Each field is checked only if present, with exact types.
export function validateBankTransferUpdate(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const value: BankTransferChanges = {}
  const has = (field: string) => Object.hasOwn(source, field)
  for (const field of Object.keys(source)) if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) errors[field] = `${field} is not an editable field.`
  if (Object.keys(source).length === 0) errors.body = 'Send at least one field to change.'
  if (has('enabled')) {
    if (typeof source.enabled === 'boolean') value.enabled = source.enabled
    else errors.enabled = 'enabled must be true or false.'
  }
  // Text only: anything else is refused rather than read as empty, which would quietly clear a detail.
  const textField = (field: 'bankName' | 'accountName' | 'accountNumber' | 'instructions', maxLength: number) => {
    if (!has(field)) return
    if (typeof source[field] !== 'string') errors[field] = `${field} must be text.`
    else value[field] = text(source[field], maxLength, field, errors)
  }
  textField('bankName', 120)
  textField('accountName', 120)
  textField('accountNumber', 10)
  textField('instructions', 500)
  // Nigerian account numbers (NUBAN) are exactly 10 digits. Spaces people type are not accepted here:
  // the admin form removes them before sending.
  if (value.accountNumber && !/^\d{10}$/.test(value.accountNumber)) errors.accountNumber = 'accountNumber must be the 10-digit account number (NUBAN).'
  if (has('payWithinDays')) {
    const days = source.payWithinDays
    if (typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 30) value.payWithinDays = days
    else errors.payWithinDays = 'payWithinDays must be a whole number of days from 1 to 30.'
  }
  return { errors, value }
}
