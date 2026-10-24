import { FULFILMENT_STATUSES } from '../models/Order.js'
import type { FulfilmentStatus } from '../models/Order.js'
import { ORDER_STAGES } from '../services/adminOrders.js'
import type { OrderStage } from '../services/adminOrders.js'
import { asFields, pageNumber, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

// Customer-facing order references (utils/reference.ts), e.g. GPEC-O-2026-1A2B3C4D.
export const ORDER_REFERENCE_PATTERN = /^GPEC-O-\d{4}-[0-9A-F]{8}$/

// ?page=2&stage=new&q=okoro — all optional. Unknown query parameters are ignored.
export function validateOrderListQuery(query: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(query)
  const page = pageNumber(source.page, errors)
  const stage = source.stage === undefined ? null : ORDER_STAGES.find((name) => name === source.stage) ?? null
  if (source.stage !== undefined && !stage) errors.stage = `stage must be one of: ${ORDER_STAGES.join(', ')}.`
  const search = text(source.q, 100, 'q', errors)
  return { errors, value: { page, stage: stage as OrderStage | null, search } }
}

// Whether to email the customer about a change: true or false only, false when left out.
function notifyCustomerField(source: Record<string, unknown>, errors: ValidationErrors) {
  if (source.notifyCustomer === undefined) return false
  if (typeof source.notifyCustomer === 'boolean') return source.notifyCustomer
  errors.notifyCustomer = 'notifyCustomer must be true or false.'
  return false
}

// { fulfilmentStatus, notifyCustomer? } and nothing else: customer details, items, amounts, and
// payment status are never edited by admins.
export function validateFulfilmentChange(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  for (const field of Object.keys(source)) if (field !== 'fulfilmentStatus' && field !== 'notifyCustomer') errors[field] = `${field} cannot be changed.`
  const status = FULFILMENT_STATUSES.find((name) => name === source.fulfilmentStatus)
  if (!status) errors.fulfilmentStatus = `fulfilmentStatus must be one of: ${FULFILMENT_STATUSES.join(', ')}.`
  const notifyCustomer = notifyCustomerField(source, errors)
  return { errors, value: { fulfilmentStatus: (status ?? 'new') as FulfilmentStatus, notifyCustomer } }
}

// Closing an unpaid transfer: { notifyCustomer? } and nothing else (who and what come from the
// session and the route).
export function validateTransferClose(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  for (const field of Object.keys(source)) if (field !== 'notifyCustomer') errors[field] = `${field} cannot be sent.`
  return { errors, value: { notifyCustomer: notifyCustomerField(source, errors) } }
}
