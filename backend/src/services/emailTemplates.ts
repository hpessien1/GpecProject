// Wording of every email the site sends. Plain text. Subjects contain only server-made references,
// never customer input.
import { formatMoney } from './currency.js'

export interface ContactEmailData {
  reference: string
  createdAt: Date
  fullName: string
  company: string
  email: string
  phone: string
  subject: string
  message: string
}

const received = (date: Date) => `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} (UTC)`
const optional = (label: string, value: string) => value ? [`${label}: ${value}`] : []

export function staffContactEmail(request: ContactEmailData, siteUrl: string) {
  return {
    subject: `New contact request ${request.reference}`,
    text: [
      'A new message has arrived through the GPEC website contact form.',
      '',
      `Reference: ${request.reference}`,
      `Received: ${received(request.createdAt)}`,
      `Name: ${request.fullName}`,
      ...optional('Company', request.company),
      `Email: ${request.email}`,
      ...optional('Phone', request.phone),
      ...optional('Topic', request.subject),
      '',
      'Message:',
      request.message,
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/contact-requests/${request.reference}`,
      'Reply to this email to answer the customer directly.',
    ].join('\n'),
  }
}

export interface AdminEmailData {
  name: string
  email: string
}

export function adminPasswordResetEmail(admin: AdminEmailData, link: string, minutes: number) {
  return {
    subject: 'Reset your GPEC admin password',
    text: [
      `Hello ${admin.name},`,
      '',
      'Someone asked to reset the password for your GPEC website admin account. To choose a new password, open this link:',
      '',
      link,
      '',
      `The link works once, for ${minutes} minutes. Choosing a new password logs you out everywhere.`,
      '',
      'If you did not ask for this, ignore this email: your password stays as it is.',
      '',
      'GPEC website',
    ].join('\n'),
  }
}

export function adminPasswordChangedEmail(admin: AdminEmailData, siteUrl: string) {
  return {
    subject: 'Your GPEC admin password was changed',
    text: [
      `Hello ${admin.name},`,
      '',
      'The password for your GPEC website admin account was just changed using a reset link, and you were logged out everywhere.',
      '',
      `If this was you, there is nothing to do. If it was not, ask for a new reset link at ${siteUrl}/#admin/forgot-password straight away and tell the site administrator.`,
      '',
      'GPEC website',
    ].join('\n'),
  }
}

export function customerContactEmail(request: ContactEmailData, siteUrl: string) {
  return {
    subject: `We have your message (${request.reference})`,
    text: [
      `Hello ${request.fullName},`,
      '',
      `Thank you for contacting GPEC. Your reference is ${request.reference}.`,
      '',
      'A GPEC representative will reply using the contact details you gave us.',
      '',
      'If you did not send this message, you can ignore this email.',
      '',
      'GPEC',
      siteUrl,
    ].join('\n'),
  }
}

export interface OrderEmailData {
  reference: string
  paidAt?: Date | null
  customer: { fullName: string, company?: string | null, email: string, phone: string }
  items: { name: string, reference: string, unitPrice: number, quantity: number, lineTotal: number }[]
  fulfilmentMethod: string
  deliveryAddress?: string | null
  deliveryArea?: { name: string } | null
  customerNotes?: string | null
  paymentMethod?: string | null
  bankTransfer?: { bankName: string, accountName: string, accountNumber: string, instructions?: string | null, payWithinDays: number } | null
  createdAt?: Date
  currency: string
  subtotal: number
  deliveryFee: number
  paystackFee: number
  total: number
}

// GPEC's service location (README "Company Profile"), confirmed by the owner as the pickup point
// (2026-10-23). Collection hours are not known yet, so GPEC arranges the time with each customer.
export const PICKUP_LOCATION = '#19 King Slope Street, Woji, off Alcon Road, Port Harcourt, Rivers State'

function orderLines(order: OrderEmailData, totalLabel = 'Total paid') {
  const money = (amount: number) => formatMoney(amount, order.currency)
  return [
    ...order.items.map((item) => `${item.quantity} × ${item.name} (${item.reference}) at ${money(item.unitPrice)} each: ${money(item.lineTotal)}`),
    '',
    `Subtotal: ${money(order.subtotal)}`,
    ...(order.fulfilmentMethod === 'delivery' ? [`Delivery${order.deliveryArea ? ` (${order.deliveryArea.name})` : ''}: ${money(order.deliveryFee)}`] : []),
    // Bank transfers carry no Paystack fee, so no fee line.
    ...(order.paymentMethod === 'bank_transfer' ? [] : [`Payment processing fee: ${money(order.paystackFee)}`]),
    `${totalLabel}: ${money(order.total)}`,
  ]
}

const fulfilmentLine = (order: OrderEmailData) => order.fulfilmentMethod === 'delivery'
  ? `Delivery to: ${order.deliveryAddress ?? ''}${order.deliveryArea ? ` (${order.deliveryArea.name})` : ''}`
  : 'Pickup from GPEC'

function customerLines(order: OrderEmailData) {
  return [
    `Name: ${order.customer.fullName}`,
    ...optional('Company', order.customer.company ?? ''),
    `Email: ${order.customer.email}`,
    `Phone: ${order.customer.phone}`,
    fulfilmentLine(order),
    ...(order.customerNotes ? ['', 'Customer notes:', order.customerNotes] : []),
  ]
}

// The account details and what to put as the transfer's description, exactly as the order recorded them.
function transferLines(order: OrderEmailData) {
  const bank = order.bankTransfer
  if (!bank) return []
  return [
    `Bank: ${bank.bankName}`,
    `Account name: ${bank.accountName}`,
    `Account number: ${bank.accountNumber}`,
    `Amount: ${formatMoney(order.total, order.currency)}`,
    `Description / narration: ${order.reference}`,
    ...(bank.instructions ? ['', bank.instructions] : []),
  ]
}

export function customerTransferOrderEmail(order: OrderEmailData, siteUrl: string, resultUrl: string) {
  return {
    subject: `Your GPEC order ${order.reference}: how to pay by bank transfer`,
    text: [
      `Hello ${order.customer.fullName},`,
      '',
      `Thank you for your order. Your order reference is ${order.reference}. To complete it, transfer the amount below to GPEC within ${order.bankTransfer?.payWithinDays ?? ''} days, using your order reference as the description so GPEC can match your payment.`,
      '',
      ...transferLines(order),
      '',
      ...orderLines(order, 'Total to pay'),
      '',
      `Once you have sent it, let GPEC know here: ${resultUrl}`,
      'GPEC will confirm by email when the money has arrived. Your order is prepared only after that.',
      '',
      'GPEC',
      siteUrl,
    ].join('\n'),
  }
}

export function staffTransferOrderEmail(order: OrderEmailData, siteUrl: string) {
  return {
    subject: `New order awaiting bank transfer ${order.reference}`,
    text: [
      `A customer has placed an order to pay by bank transfer. Nothing has been paid yet. When the money arrives in GPEC's account (description ${order.reference}), confirm it on the order in the admin panel.`,
      '',
      `Order: ${order.reference}`,
      ...customerLines(order),
      '',
      ...orderLines(order, 'Total to pay'),
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/orders/${order.reference}`,
    ].join('\n'),
  }
}

export function staffTransferReportedEmail(order: OrderEmailData, siteUrl: string) {
  return {
    subject: `Customer reports a bank transfer for ${order.reference}`,
    text: [
      `The customer says they have sent the bank transfer for order ${order.reference} (${formatMoney(order.total, order.currency)}). This is only their word: check GPEC's bank account for a payment with the description ${order.reference}, then confirm it on the order.`,
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/orders/${order.reference}`,
    ].join('\n'),
  }
}

// Sent to every active admin: bank details decide where customers' money goes, so a change nobody
// expected must be noticed at once.
export function bankDetailsChangedEmail(changedBy: AdminEmailData, fields: string[], details: { enabled: boolean, bankName: string, accountName: string, accountNumber: string }, siteUrl: string) {
  return {
    subject: 'GPEC bank transfer details were changed',
    text: [
      `${changedBy.name} (${changedBy.email}) changed the bank transfer details on the GPEC website: ${fields.join(', ')}.`,
      '',
      `Bank transfer at checkout: ${details.enabled ? 'on' : 'off'}`,
      `Bank: ${details.bankName || '(empty)'}`,
      `Account name: ${details.accountName || '(empty)'}`,
      `Account number: ${details.accountNumber || '(empty)'}`,
      '',
      `If you did not expect this change, check it now at ${siteUrl}/#admin/bank-transfer and change the admin passwords.`,
      '',
      'GPEC website',
    ].join('\n'),
  }
}

export function staffOrderEmail(order: OrderEmailData, siteUrl: string) {
  return {
    subject: `New paid order ${order.reference}`,
    text: [
      order.paymentMethod === 'bank_transfer' ? 'A bank transfer for an order on the GPEC website has been confirmed as received.' : 'A customer has paid for an order on the GPEC website. Paystack confirmed the payment.',
      '',
      `Order: ${order.reference}`,
      ...(order.paidAt ? [`Paid: ${received(order.paidAt)}`] : []),
      ...customerLines(order),
      '',
      ...orderLines(order),
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/orders/${order.reference}`,
    ].join('\n'),
  }
}

export function customerOrderEmail(order: OrderEmailData, siteUrl: string) {
  return {
    subject: `Your GPEC order ${order.reference} is paid`,
    text: [
      `Hello ${order.customer.fullName},`,
      '',
      `Thank you for your order. Your payment has been received and your order reference is ${order.reference}.`,
      '',
      ...orderLines(order),
      '',
      order.fulfilmentMethod === 'delivery'
        ? `GPEC will contact you to arrange delivery to the address you gave${order.deliveryArea ? ` (${order.deliveryArea.name})` : ''}.`
        : `Your order is for pickup from GPEC at ${PICKUP_LOCATION}. GPEC will contact you when it is ready and to agree a collection time. Please bring your order reference.`,
      '',
      `If you have a question about your order, contact GPEC through ${siteUrl}/#contact and give your order reference.`,
      '',
      'GPEC',
      siteUrl,
    ].join('\n'),
  }
}
