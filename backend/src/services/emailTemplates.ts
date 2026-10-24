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
  // How many photos or documents the customer attached (the files stay in the admin panel).
  files?: number
}

const received = (date: Date) => `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} (UTC)`
const optional = (label: string, value: string) => value ? [`${label}: ${value}`] : []
const fileCount = (files: number) => files === 1 ? '1 file' : `${files} files`

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
      ...(request.files ? [`Attached: ${fileCount(request.files)}. Open the request in the admin panel to see them.`, ''] : []),
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

// The code itself is in the body only; the subject is fixed, so it never shows on a lock screen.
export function adminLoginCodeEmail(admin: AdminEmailData, code: string, minutes: number) {
  return {
    subject: 'Your GPEC admin login code',
    text: [
      `Hello ${admin.name},`,
      '',
      'Your code to finish logging in to the GPEC website admin panel:',
      '',
      code,
      '',
      `It works once, for ${minutes} minutes.`,
      '',
      'If you are not logging in right now, someone else has your password: change it straight away and tell the site administrator.',
      '',
      'GPEC website',
    ].join('\n'),
  }
}

// For setting up email codes, or confirming two-step login being turned off or new recovery codes.
export function adminAccountCodeEmail(admin: AdminEmailData, code: string, minutes: number) {
  return {
    subject: 'Your GPEC admin security code',
    text: [
      `Hello ${admin.name},`,
      '',
      'Your code to confirm a change to two-step login on your GPEC website admin account:',
      '',
      code,
      '',
      `It works once, for ${minutes} minutes.`,
      '',
      'If you did not ask for this, someone may be using your logged-in account: change your password and tell the site administrator.',
      '',
      'GPEC website',
    ].join('\n'),
  }
}

const METHOD_NAMES = { app: 'an authenticator app', email: 'a code by email' }

export function adminTwoFactorChangedEmail(admin: AdminEmailData, change: { on: true, method: 'app' | 'email' } | { on: false }, siteUrl: string) {
  return {
    subject: change.on ? 'Two-step login is on for your GPEC admin account' : 'Two-step login was turned off for your GPEC admin account',
    text: [
      `Hello ${admin.name},`,
      '',
      change.on
        ? `Two-step login was just turned on for your GPEC website admin account, with ${METHOD_NAMES[change.method]}. From now on, logging in needs your password and a code. Keep your recovery codes somewhere safe: each one gets you in once if you cannot get a code.`
        : 'Two-step login was just turned off for your GPEC website admin account. Logging in now needs only your password.',
      '',
      `If this was you, there is nothing to do. If it was not, change your password at ${siteUrl}/#admin/password straight away and tell the site administrator.`,
      '',
      'GPEC website',
    ].join('\n'),
  }
}

export function adminRecoveryCodeUsedEmail(admin: AdminEmailData, left: number, siteUrl: string) {
  return {
    subject: 'A recovery code was used for your GPEC admin account',
    text: [
      `Hello ${admin.name},`,
      '',
      `A recovery code was just used to log in to your GPEC website admin account. It cannot be used again; you have ${left} left.`,
      '',
      `If you are running low, make new ones at ${siteUrl}/#admin/security. If this was not you, change your password straight away and tell the site administrator.`,
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
      ...(request.files ? [`We received the ${fileCount(request.files)} you attached.`] : []),
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
  bankTransfer?: { bankName: string, accountName: string, accountNumber: string, instructions?: string | null, payWithinDays: number, isSample?: boolean | null } | null
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
    ...(bank.isSample ? ['SAMPLE DETAILS FOR TESTING: DO NOT SEND MONEY. GPEC has not entered its real bank account yet.', ''] : []),
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

export function replyToChangedEmail(changedBy: AdminEmailData, from: string, to: string, siteUrl: string) {
  return {
    subject: 'GPEC customer email reply address was changed',
    text: [
      `${changedBy.name} (${changedBy.email}) changed where customers' replies to GPEC's emails go.`,
      '',
      `Before: ${from}`,
      `Now: ${to}`,
      '',
      'Replies to order confirmations, bank-transfer instructions, and contact confirmations now go to the new address.',
      `If you did not expect this change, check it now at ${siteUrl}/#admin/emails and change the admin passwords.`,
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
      `If you have a question about your order, reply to this email, or contact GPEC through ${siteUrl}/#contact and give your order reference.`,
      '',
      'GPEC',
      siteUrl,
    ].join('\n'),
  }
}
