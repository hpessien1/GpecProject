import { FULFILMENT_STATUSES } from '../models/Order.js'
import type { FulfilmentStatus } from '../models/Order.js'
import { ORDER_STAGES } from '../services/adminOrders.js'
import type { OrderStage } from '../services/adminOrders.js'
import { asFields, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

// Customer-facing order references (utils/reference.ts), e.g. GPEC-O-2026-1A2B3C4D.
export const ORDER_REFERENCE_PATTERN = /^GPEC-O-\d{4}-[0-9A-F]{8}$/

// ?page=2&stage=new&q=okoro — all optional. Unknown query parameters are ignored.
export function validateOrderListQuery(query: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(query)
  const page = source.page === undefined ? 1 : Number(source.page)
  if (!Number.isInteger(page) || page < 1 || page > 10_000) errors.page = 'page must be a whole number from 1.'
  const stage = source.stage === undefined ? null : ORDER_STAGES.find((name) => name === source.stage) ?? null
  if (source.stage !== undefined && !stage) errors.stage = `stage must be one of: ${ORDER_STAGES.join(', ')}.`
  const search = text(source.q, 100, 'q', errors)
  return { errors, value: { page, stage: stage as OrderStage | null, search } }
}

// { fulfilmentStatus } and nothing else: customer details, items, amounts, and payment status are
// never edited by admins.
export function validateFulfilmentChange(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  for (const field of Object.keys(source)) if (field !== 'fulfilmentStatus') errors[field] = `${field} cannot be changed.`
  const status = FULFILMENT_STATUSES.find((name) => name === source.fulfilmentStatus)
  if (!status) errors.fulfilmentStatus = `fulfilmentStatus must be one of: ${FULFILMENT_STATUSES.join(', ')}.`
  return { errors, value: { fulfilmentStatus: (status ?? 'new') as FulfilmentStatus } }
}
