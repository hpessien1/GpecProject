import { getJson, postJson } from './apiClient'
import type { BasketPayload, CheckoutInfo, OrderPayload, OrderQuote, PaymentResult, StartedOrder } from '../types'

export function fetchCheckoutInfo() {
  return getJson<CheckoutInfo>('/checkout', 'Unable to load the checkout. Please try again.')
}

// The server works out every amount; the browser sends product IDs, quantities, and the delivery choice.
export function quoteOrder(basket: BasketPayload) {
  return postJson<OrderQuote>('/checkout/quote', basket, 'Unable to work out your total. Please try again.')
}

export function placeOrder(order: OrderPayload) {
  return postJson<StartedOrder>('/checkout/orders', order, 'Unable to start the payment. Nothing was charged. Please try again.')
}

// The server checks with Paystack itself; arriving back from Paystack proves nothing on its own.
export function checkPayment(paymentReference: string) {
  return getJson<PaymentResult>(`/checkout/orders/${encodeURIComponent(paymentReference)}`, 'Unable to check your payment. Please try again.')
}

// "I have sent the transfer": tells GPEC staff to look for it. It proves nothing on its own.
export function reportTransferSent(paymentReference: string) {
  return postJson<PaymentResult>(`/checkout/orders/${encodeURIComponent(paymentReference)}/transfer-sent`, undefined, 'Unable to let GPEC know. Please try again.')
}
