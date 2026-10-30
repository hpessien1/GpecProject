import { FULFILMENT_METHODS, PAYMENT_METHODS } from '../models/Order.js'
import { PRODUCT_ID_PATTERN } from './adminProduct.js'
import { isDeliveryAreaId } from './deliveryArea.js'
import { HONEYPOT_FIELD, asFields, emailPattern, oneLineText, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

export const MAX_ORDER_LINES = 50
export const MAX_LINE_QUANTITY = 1000
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/
// The MongoDB _id of an order, also its Paystack reference: 24 hexadecimal characters.
export const PAYMENT_REFERENCE_PATTERN = /^[0-9a-f]{24}$/

// What the browser may send. Everything else (names, prices, fees, totals, currency, status, return
// address) is decided by the server, so those fields are not accepted at all (CLAUDE.md 4.2).
const BASKET_FIELDS = ['items', 'fulfilmentMethod', 'deliveryAreaId', 'paymentMethod'] as const
const ORDER_FIELDS = [...BASKET_FIELDS, 'fullName', 'company', 'email', 'phone', 'deliveryAddress', 'notes', HONEYPOT_FIELD] as const

export interface BasketInput {
  items: { productId: string, quantity: number }[]
  fulfilmentMethod: typeof FULFILMENT_METHODS[number]
  // Only for delivery: the area the order goes to.
  deliveryAreaId: string | null
  // Paystack (the default when left out) or bank transfer, which has no Paystack fee.
  paymentMethod: typeof PAYMENT_METHODS[number]
}

export interface OrderInput extends BasketInput {
  customer: { fullName: string, company: string, email: string, phone: string }
  deliveryAddress: string
  notes: string
}

function rejectUnknownFields(source: Record<string, unknown>, allowed: readonly string[], errors: ValidationErrors) {
  for (const field of Object.keys(source)) if (!allowed.includes(field)) errors[field] = `${field} is not accepted.`
}

// Lines of { productId, quantity } only, each product once.
function readItems(value: unknown, errors: ValidationErrors) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ORDER_LINES) {
    errors.items = `items must list 1 to ${MAX_ORDER_LINES} products.`
    return []
  }
  const items: BasketInput['items'] = []
  for (const entry of value) {
    const line = asFields(entry)
    const { productId, quantity } = line
    const extra = Object.keys(line).filter((field) => field !== 'productId' && field !== 'quantity')
    if (extra.length > 0 || typeof productId !== 'string' || !PRODUCT_ID_PATTERN.test(productId)
      || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      errors.items = `Each item must be { productId, quantity } with a quantity from 1 to ${MAX_LINE_QUANTITY}.`
      return []
    }
    if (items.some((item) => item.productId === productId)) {
      errors.items = 'Each product may appear only once.'
      return []
    }
    items.push({ productId, quantity })
  }
  return items
}

function readBasket(source: Record<string, unknown>, errors: ValidationErrors): BasketInput {
  const items = readItems(source.items, errors)
  const fulfilmentMethod = FULFILMENT_METHODS.find((method) => method === source.fulfilmentMethod)
  if (!fulfilmentMethod) errors.fulfilmentMethod = 'Choose pickup or delivery.'
  let deliveryAreaId: string | null = null
  if (fulfilmentMethod === 'delivery') {
    if (isDeliveryAreaId(source.deliveryAreaId)) deliveryAreaId = source.deliveryAreaId
    else errors.deliveryAreaId = 'Choose the area the order is going to.'
  } else if (source.deliveryAreaId !== undefined && source.deliveryAreaId !== null && source.deliveryAreaId !== '') {
    errors.deliveryAreaId = 'A delivery area is only for delivery orders.'
  }
  const paymentMethod = source.paymentMethod === undefined ? 'paystack' : PAYMENT_METHODS.find((method) => method === source.paymentMethod)
  if (!paymentMethod) errors.paymentMethod = 'Choose Paystack or bank transfer.'
  return { items, fulfilmentMethod: fulfilmentMethod ?? 'pickup', deliveryAreaId, paymentMethod: paymentMethod ?? 'paystack' }
}

// For the order summary shown before paying.
export function validateBasket(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  rejectUnknownFields(source, BASKET_FIELDS, errors)
  return { errors, value: readBasket(source, errors) }
}

export function validateOrder(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  rejectUnknownFields(source, ORDER_FIELDS, errors)
  const basket = readBasket(source, errors)
  const customer = {
    fullName: oneLineText(source.fullName, 120, 'fullName', errors, true),
    company: oneLineText(source.company, 120, 'company', errors),
    email: text(source.email, 254, 'email', errors, true).toLowerCase(),
    phone: oneLineText(source.phone, 40, 'phone', errors, true),
  }
  if (customer.email && !emailPattern.test(customer.email)) errors.email = 'email must be valid.'
  if (customer.phone && !PHONE_PATTERN.test(customer.phone)) errors.phone = 'phone must be a phone number, e.g. +234 803 123 4567.'
  // Pickup orders never collect an address (Product Principle 5): one sent anyway is refused.
  const deliveryAddress = text(source.deliveryAddress, 500, 'deliveryAddress', errors, basket.fulfilmentMethod === 'delivery')
  if (basket.fulfilmentMethod === 'pickup' && deliveryAddress) errors.deliveryAddress = 'A delivery address is only for delivery orders.'
  const notes = text(source.notes, 1000, 'notes', errors)
  return { errors, value: { ...basket, customer, deliveryAddress, notes } satisfies OrderInput }
}
