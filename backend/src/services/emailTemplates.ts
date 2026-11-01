// Wording of every email the site sends: a plain-text copy and the designed version (the layout is in
// emailLayout.ts). Subjects contain only server-made references, never customer input.
import { formatMoney } from './currency.js'
import { button, codeBlock, details, emailPage, heading, highlight, html, link, note, orderTable, paragraph, quotedBlock, warning } from './emailLayout.js'
import { LINE_BREAK } from '../validation/fields.js'

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

export const utcTime = (date: Date) => `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} (UTC)`
// A one-line detail the customer typed (name, company, phone), kept on its line in staff emails, also
// for one saved before line breaks were refused there (audit S5-L01).
const LINE_BREAKS = new RegExp(`\\s*${LINE_BREAK.source}+\\s*`, 'g')
const oneLine = (value: string) => value.replace(LINE_BREAKS, ' ')
const optional = (label: string, value: string) => value ? [`${label}: ${oneLine(value)}`] : []
// What the customer wrote over several lines (a message, notes, an address), in staff emails: every
// line starts with "> ", as quoted text does in email, so none can pass for one of GPEC's own, such as
// a fake "Open it in the admin panel" link (fifth audit sweep).
const quoted = (value: string) => value.split(new RegExp(`\r\n|${LINE_BREAK.source}`)).map((line) => line ? `> ${line}` : '>')
// Customer emails greet no one by name: anyone can send the forms with a stranger's address, so a
// "name" could put words or a link of its own above GPEC's (audit S5-L01).
const CUSTOMER_GREETING = 'Hello,'
const fileCount = (files: number) => files === 1 ? '1 file' : `${files} files`

export function staffContactEmail(request: ContactEmailData, siteUrl: string) {
  return {
    subject: `New contact request ${request.reference}`,
    text: [
      'A new message has arrived through the GPEC website contact form.',
      '',
      `Reference: ${request.reference}`,
      `Received: ${utcTime(request.createdAt)}`,
      `Name: ${oneLine(request.fullName)}`,
      ...optional('Company', request.company),
      `Email: ${request.email}`,
      ...optional('Phone', request.phone),
      ...optional('Topic', request.subject),
      '',
      'Message:',
      ...quoted(request.message),
      '',
      ...(request.files ? [`Attached: ${fileCount(request.files)}. Open the request in the admin panel to see them.`, ''] : []),
      `Open it in the admin panel: ${siteUrl}/#admin/contact-requests/${request.reference}`,
      'Reply to this email to answer the customer directly.',
    ].join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'A new message arrived through the website.',
      headline: 'New contact request',
      blocks: [
        details([
          { label: 'Reference', value: request.reference, code: true },
          { label: 'Received', value: utcTime(request.createdAt) },
          { label: 'Name', value: oneLine(request.fullName) },
          request.company ? { label: 'Company', value: oneLine(request.company) } : null,
          { label: 'Email', value: request.email },
          request.phone ? { label: 'Phone', value: oneLine(request.phone) } : null,
          request.subject ? { label: 'Topic', value: oneLine(request.subject) } : null,
          request.files ? { label: 'Attached', value: fileCount(request.files) } : null,
        ]),
        quotedBlock('Message, as the customer typed it', request.message),
        button('Open in the admin panel', `${siteUrl}/#admin/contact-requests/${request.reference}`),
        note('Reply to this email to answer the customer directly.'),
      ],
    }),
  }
}

export interface AdminEmailData {
  name: string
  email: string
}

export interface UnmatchedPayment {
  reference: string
  amount: number
  currency: string
  reason: 'no_order' | 'mismatch'
}

export function adminPasswordResetEmail(admin: AdminEmailData, resetLink: string, minutes: number, siteUrl: string) {
  return {
    subject: 'Reset your GPEC admin password',
    text: [
      `Hello ${admin.name},`,
      '',
      'Someone asked to reset the password for your GPEC website admin account. To choose a new password, open this link:',
      '',
      resetLink,
      '',
      `The link works once, for ${minutes} minutes. Choosing a new password logs you out everywhere.`,
      '',
      'If you did not ask for this, ignore this email: your password stays as it is.',
      '',
      'GPEC website',
    ].join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'Choose a new password for your GPEC admin account.',
      headline: 'Reset your password',
      blocks: [
        paragraph(`Hello ${admin.name},`),
        paragraph('Someone asked to reset the password for your GPEC website admin account. To choose a new password, use this button:'),
        button('Choose a new password', resetLink),
        note(`The link works once, for ${minutes} minutes. Choosing a new password logs you out everywhere.`),
        note('If you did not ask for this, ignore this email: your password stays as it is.'),
      ],
    }),
  }
}

// how: with a reset link, or in the admin panel by someone logged in with the current password (audit
// S3-L01); each says what actually happened.
export function adminPasswordChangedEmail(admin: AdminEmailData, how: 'reset' | 'panel', siteUrl: string) {
  return {
    subject: 'Your GPEC admin password was changed',
    text: [
      `Hello ${admin.name},`,
      '',
      how === 'reset'
        ? 'The password for your GPEC website admin account was just changed using a reset link, and you were logged out everywhere.'
        : 'The password for your GPEC website admin account was just changed in the admin panel, by someone logged in who knew the current password. Everywhere else you were logged in has been logged out.',
      '',
      `If this was you, there is nothing to do. If it was not, ask for a new reset link at ${siteUrl}/#admin/forgot-password straight away and tell the site administrator.`,
      '',
      'GPEC website',
    ].join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'If this was not you, act straight away.',
      headline: 'Your password was changed',
      blocks: [
        paragraph(`Hello ${admin.name},`),
        paragraph(how === 'reset'
          ? 'The password for your GPEC website admin account was just changed using a reset link, and you were logged out everywhere.'
          : 'The password for your GPEC website admin account was just changed in the admin panel, by someone logged in who knew the current password. Everywhere else you were logged in has been logged out.'),
        paragraph(html`If this was you, there is nothing to do. If it was not, ${link('ask for a new reset link', `${siteUrl}/#admin/forgot-password`)} straight away and tell the site administrator.`),
      ],
    }),
  }
}

// The code itself is in the body only; the subject is fixed, so it never shows on a lock screen.
export function adminLoginCodeEmail(admin: AdminEmailData, code: string, minutes: number, siteUrl: string) {
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
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'Your code to finish logging in.',
      headline: 'Your login code',
      blocks: [
        paragraph(`Hello ${admin.name},`),
        paragraph('Your code to finish logging in to the GPEC website admin panel:'),
        codeBlock(code),
        note(`It works once, for ${minutes} minutes.`),
        note('If you are not logging in right now, someone else has your password: change it straight away and tell the site administrator.'),
      ],
    }),
  }
}

// For setting up email codes, or confirming two-step login being turned off or new recovery codes.
export function adminAccountCodeEmail(admin: AdminEmailData, code: string, minutes: number, siteUrl: string) {
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
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'Your code to confirm a change to two-step login.',
      headline: 'Your security code',
      blocks: [
        paragraph(`Hello ${admin.name},`),
        paragraph('Your code to confirm a change to two-step login on your GPEC website admin account:'),
        codeBlock(code),
        note(`It works once, for ${minutes} minutes.`),
        note('If you did not ask for this, someone may be using your logged-in account: change your password and tell the site administrator.'),
      ],
    }),
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
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'If this was not you, act straight away.',
      headline: change.on ? 'Two-step login is on' : 'Two-step login was turned off',
      blocks: [
        paragraph(`Hello ${admin.name},`),
        paragraph(change.on
          ? `Two-step login was just turned on for your GPEC website admin account, with ${METHOD_NAMES[change.method]}. From now on, logging in needs your password and a code. Keep your recovery codes somewhere safe: each one gets you in once if you cannot get a code.`
          : 'Two-step login was just turned off for your GPEC website admin account. Logging in now needs only your password.'),
        paragraph(html`If this was you, there is nothing to do. If it was not, ${link('change your password', `${siteUrl}/#admin/password`)} straight away and tell the site administrator.`),
      ],
    }),
  }
}

// The codes themselves are never emailed (audit S3-L01).
export function adminRecoveryCodesReplacedEmail(admin: AdminEmailData, siteUrl: string) {
  return {
    subject: 'New recovery codes were made for your GPEC admin account',
    text: [
      `Hello ${admin.name},`,
      '',
      'New recovery codes were just made for your GPEC website admin account. The old ones no longer work.',
      '',
      `If this was you, keep the new ones somewhere safe. If it was not, someone has your password and a way to get your codes: ask for a reset link at ${siteUrl}/#admin/forgot-password straight away and tell the site administrator.`,
      '',
      'GPEC website',
    ].join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'If this was not you, act straight away.',
      headline: 'New recovery codes were made',
      blocks: [
        paragraph(`Hello ${admin.name},`),
        paragraph('New recovery codes were just made for your GPEC website admin account. The old ones no longer work.'),
        paragraph(html`If this was you, keep the new ones somewhere safe. If it was not, someone has your password and a way to get your codes: ${link('ask for a reset link', `${siteUrl}/#admin/forgot-password`)} straight away and tell the site administrator.`),
      ],
    }),
  }
}

// Sent once when wrong passwords pause the account's login (audit S5-M01). Never the passwords tried.
export function adminLoginPausedEmail(admin: AdminEmailData, tries: number, until: Date, siteUrl: string) {
  return {
    subject: 'Login to your GPEC admin account is paused',
    text: [
      `Hello ${admin.name},`,
      '',
      `${tries} wrong passwords have been tried for your GPEC website admin account within an hour. To protect it, logging in to your account, and changes in the admin panel that need your password, are paused until ${utcTime(until)}, even with the right password.`,
      '',
      `To end the pause now, set a new password with a reset link: ${siteUrl}/#admin/forgot-password`,
      '',
      `If this was not you, someone may be trying to guess your password: set a new, long one with a reset link, turn on two-step login if it is off, and tell the site administrator. The security log shows the attempts: ${siteUrl}/#admin/security-log`,
      '',
      'GPEC website',
    ].join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'Too many wrong passwords were tried for your account.',
      headline: 'Your login is paused',
      blocks: [
        paragraph(`Hello ${admin.name},`),
        paragraph(`${tries} wrong passwords have been tried for your GPEC website admin account within an hour. To protect it, logging in to your account, and changes in the admin panel that need your password, are paused until ${utcTime(until)}, even with the right password.`),
        button('Set a new password to end the pause', `${siteUrl}/#admin/forgot-password`),
        paragraph(html`If this was not you, someone may be trying to guess your password: set a new, long one with a reset link, turn on two-step login if it is off, and tell the site administrator. ${link('The security log', `${siteUrl}/#admin/security-log`)} shows the attempts.`),
      ],
    }),
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
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'If this was not you, act straight away.',
      headline: 'A recovery code was used',
      blocks: [
        paragraph(`Hello ${admin.name},`),
        paragraph(`A recovery code was just used to log in to your GPEC website admin account. It cannot be used again; you have ${left} left.`),
        paragraph(html`If you are running low, ${link('make new ones', `${siteUrl}/#admin/security`)}. If this was not you, change your password straight away and tell the site administrator.`),
      ],
    }),
  }
}

export function customerContactEmail(request: ContactEmailData, siteUrl: string) {
  return {
    subject: `We have your message (${request.reference})`,
    text: [
      CUSTOMER_GREETING,
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
    html: emailPage({
      siteUrl,
      audience: 'customer',
      preview: 'Thank you for contacting GPEC.',
      headline: 'We have your message',
      blocks: [
        paragraph('Hello,'),
        paragraph(request.files ? `Thank you for contacting GPEC. We received your message and the ${fileCount(request.files)} you attached.` : 'Thank you for contacting GPEC. We received your message.'),
        details([{ label: 'Your reference', value: request.reference, code: true }]),
        paragraph('A GPEC representative will reply using the contact details you gave us.'),
        note('If you did not send this message, you can ignore this email.'),
      ],
    }),
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
// (2026-10-23). The collection hours are staff's own setting (services/collectionHours.ts).
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

const fulfilmentLines = (order: OrderEmailData) => order.fulfilmentMethod === 'delivery'
  ? [...(order.deliveryArea ? [`Delivery area: ${order.deliveryArea.name}`] : []), 'Delivery address:', ...quoted(order.deliveryAddress ?? '')]
  : ['Pickup from GPEC']

function customerLines(order: OrderEmailData) {
  return [
    `Name: ${oneLine(order.customer.fullName)}`,
    ...optional('Company', order.customer.company ?? ''),
    `Email: ${order.customer.email}`,
    `Phone: ${oneLine(order.customer.phone)}`,
    ...fulfilmentLines(order),
    ...(order.customerNotes ? ['', 'Customer notes:', ...quoted(order.customerNotes)] : []),
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

// While Paystack is on test keys, order emails say so (the user's choice, 2026-11-01), in both versions.
const TEST_NOTICE = 'TEST ORDER: the GPEC website is being tested. No real money was taken for this order.'
const testNotice = (testMode: boolean) => testMode ? TEST_NOTICE : null
const withTestNotice = (lines: string[], testMode: boolean) => testMode ? [TEST_NOTICE, '', ...lines] : lines

function orderTableBlock(order: OrderEmailData, totalLabel = 'Total paid') {
  return orderTable({
    currencyAmount: (amount) => formatMoney(amount, order.currency),
    items: order.items,
    charges: [
      { label: 'Subtotal', amount: order.subtotal },
      ...(order.fulfilmentMethod === 'delivery' ? [{ label: `Delivery${order.deliveryArea ? ` (${order.deliveryArea.name})` : ''}`, amount: order.deliveryFee }] : []),
      ...(order.paymentMethod === 'bank_transfer' ? [] : [{ label: 'Payment processing fee', amount: order.paystackFee }]),
    ],
    totalLabel,
    total: order.total,
  })
}

// Staff emails: who the customer is and how the order reaches them.
function customerBlocks(order: OrderEmailData) {
  return [
    heading('Customer'),
    details([
      { label: 'Name', value: oneLine(order.customer.fullName) },
      order.customer.company ? { label: 'Company', value: oneLine(order.customer.company) } : null,
      { label: 'Email', value: order.customer.email },
      { label: 'Phone', value: oneLine(order.customer.phone) },
      { label: 'Fulfilment', value: order.fulfilmentMethod === 'delivery' ? `Delivery${order.deliveryArea ? ` (${order.deliveryArea.name})` : ''}` : 'Pickup from GPEC' },
    ]),
    order.fulfilmentMethod === 'delivery' && quotedBlock('Delivery address, as the customer typed it', order.deliveryAddress ?? ''),
    order.customerNotes && quotedBlock('Customer notes, as the customer typed them', order.customerNotes),
  ]
}

const itemsBlock = (order: OrderEmailData) => [heading('On this order'), details(order.items.map((item) => ({ label: `${item.quantity} ×`, value: `${item.name} (${item.reference})` })))]
const replyNote = (order: OrderEmailData, siteUrl: string) => note(html`If you have a question, reply to this email, or use ${link('the enquiry form', `${siteUrl}/#enquiry`)} and give your order reference ${order.reference}.`)

export function customerTransferOrderEmail(order: OrderEmailData, siteUrl: string, resultUrl: string, testMode = false) {
  return {
    subject: `Your GPEC order ${order.reference}: how to pay by bank transfer`,
    text: withTestNotice([
      CUSTOMER_GREETING,
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
    ], testMode).join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'customer',
      testNotice: testNotice(testMode),
      preview: 'Thank you for your order. Here is how to pay.',
      headline: 'How to pay by bank transfer',
      blocks: [
        paragraph('Hello,'),
        paragraph(`Thank you for your order. To complete it, transfer the amount below to GPEC within ${order.bankTransfer?.payWithinDays ?? ''} days, using your order reference as the description so GPEC can match your payment.`),
        highlight('Amount to transfer', formatMoney(order.total, order.currency)),
        order.bankTransfer?.isSample && warning('SAMPLE DETAILS FOR TESTING: DO NOT SEND MONEY. GPEC has not entered its real bank account yet.'),
        order.bankTransfer && details([
          { label: 'Bank', value: order.bankTransfer.bankName },
          { label: 'Account name', value: order.bankTransfer.accountName },
          { label: 'Account number', value: order.bankTransfer.accountNumber, code: true },
          { label: 'Description / narration', value: order.reference, code: true },
        ]),
        order.bankTransfer?.instructions && quotedBlock('Instructions from GPEC', order.bankTransfer.instructions),
        heading('Your order'),
        orderTableBlock(order, 'Total to pay'),
        button('I have sent the transfer', resultUrl),
        note('GPEC will confirm by email when the money has arrived. Your order is prepared only after that.'),
      ],
    }),
  }
}

export function staffTransferOrderEmail(order: OrderEmailData, siteUrl: string, testMode = false) {
  return {
    subject: `New order awaiting bank transfer ${order.reference}`,
    text: withTestNotice([
      `A customer has placed an order to pay by bank transfer. Nothing has been paid yet. When the money arrives in GPEC's account (description ${order.reference}), confirm it on the order in the admin panel.`,
      '',
      `Order: ${order.reference}`,
      ...customerLines(order),
      '',
      ...orderLines(order, 'Total to pay'),
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/orders/${order.reference}`,
    ], testMode).join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      testNotice: testNotice(testMode),
      preview: 'Nothing has been paid yet.',
      headline: 'New order awaiting bank transfer',
      blocks: [
        paragraph(`Nothing has been paid yet. When the money arrives in GPEC's account (description ${order.reference}), confirm it on the order in the admin panel.`),
        details([{ label: 'Order', value: order.reference, code: true }]),
        button('Open in the admin panel', `${siteUrl}/#admin/orders/${order.reference}`),
        customerBlocks(order),
        heading('Order'),
        orderTableBlock(order, 'Total to pay'),
      ],
    }),
  }
}

export function staffTransferReportedEmail(order: OrderEmailData, siteUrl: string, testMode = false) {
  return {
    subject: `Customer reports a bank transfer for ${order.reference}`,
    text: withTestNotice([
      `The customer says they have sent the bank transfer for order ${order.reference} (${formatMoney(order.total, order.currency)}). This is only their word: check GPEC's bank account for a payment with the description ${order.reference}, then confirm it on the order.`,
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/orders/${order.reference}`,
    ], testMode).join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      testNotice: testNotice(testMode),
      preview: 'This is only their word: check the bank account.',
      headline: 'Customer reports a bank transfer',
      blocks: [
        paragraph(`The customer says they have sent the bank transfer for this order. This is only their word: check GPEC's bank account for a payment with the description ${order.reference}, then confirm it on the order.`),
        details([
          { label: 'Order', value: order.reference, code: true },
          { label: 'Amount', value: formatMoney(order.total, order.currency) },
        ]),
        button('Open in the admin panel', `${siteUrl}/#admin/orders/${order.reference}`),
      ],
    }),
  }
}

// Sent to every active admin: bank details decide where customers' money goes, so a change nobody
// expected must be noticed at once.
// Paystack took a payment the website could not match to an order. Nothing was marked paid, so only
// staff can put it right. Subject: fixed text. Reference, amount, and currency: from Paystack's signed message.
export function staffUnmatchedPaymentEmail(payment: UnmatchedPayment, siteUrl: string) {
  const why = payment.reason === 'no_order'
    ? 'No order matches it. Orders unpaid for over 6 months are deleted, so the order may have been one of those.'
    : 'Its amount or currency differs from the order, so the order was not marked paid.'
  let amount = `${payment.amount} (smallest unit) ${payment.currency}`
  try {
    amount = formatMoney(payment.amount, payment.currency)
  } catch {
    // An unknown currency code: shown as Paystack sent it.
  }
  return {
    subject: 'Action needed: a Paystack payment could not be matched to an order',
    text: `Paystack reports a completed payment, and the website could not match it.

${why}

Paystack reference: ${payment.reference}
Amount: ${amount}

What to do: find this reference in GPEC's Paystack dashboard to see who paid, then contact them, and refund the payment or fill the order. The website has not recorded this payment.

Admin panel: ${siteUrl}/#admin/orders
`,
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'A payment needs staff to put it right.',
      headline: 'A payment could not be matched',
      blocks: [
        paragraph('Paystack reports a completed payment, and the website could not match it.'),
        paragraph(why),
        details([
          { label: 'Paystack reference', value: payment.reference, code: true },
          { label: 'Amount', value: amount },
        ]),
        paragraph("What to do: find this reference in GPEC's Paystack dashboard to see who paid, then contact them, and refund the payment or fill the order. The website has not recorded this payment."),
        button('Open the admin panel', `${siteUrl}/#admin/orders`),
      ],
    }),
  }
}

export function bankDetailsChangedEmail(changedBy: AdminEmailData, fields: string[], bank: { enabled: boolean, bankName: string, accountName: string, accountNumber: string }, siteUrl: string) {
  return {
    subject: 'GPEC bank transfer details were changed',
    text: [
      `${changedBy.name} (${changedBy.email}) changed the bank transfer details on the GPEC website: ${fields.join(', ')}.`,
      '',
      `Bank transfer at checkout: ${bank.enabled ? 'on' : 'off'}`,
      `Bank: ${bank.bankName || '(empty)'}`,
      `Account name: ${bank.accountName || '(empty)'}`,
      `Account number: ${bank.accountNumber || '(empty)'}`,
      '',
      `If you did not expect this change, check it now at ${siteUrl}/#admin/bank-transfer and change the admin passwords.`,
      '',
      'GPEC website',
    ].join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'If you did not expect this, check it now.',
      headline: 'Bank transfer details were changed',
      blocks: [
        paragraph(`${changedBy.name} (${changedBy.email}) changed the bank transfer details on the GPEC website: ${fields.join(', ')}.`),
        details([
          { label: 'Bank transfer at checkout', value: bank.enabled ? 'On' : 'Off' },
          { label: 'Bank', value: bank.bankName || '(empty)' },
          { label: 'Account name', value: bank.accountName || '(empty)' },
          { label: 'Account number', value: bank.accountNumber || '(empty)', code: true },
        ]),
        button('Check the bank details', `${siteUrl}/#admin/bank-transfer`),
        note('If you did not expect this change, check it now and change the admin passwords.'),
      ],
    }),
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
    html: emailPage({
      siteUrl,
      audience: 'staff',
      preview: 'If you did not expect this, check it now.',
      headline: 'The reply address was changed',
      blocks: [
        paragraph(`${changedBy.name} (${changedBy.email}) changed where customers' replies to GPEC's emails go.`),
        details([{ label: 'Before', value: from }, { label: 'Now', value: to }]),
        paragraph('Replies to order confirmations, bank-transfer instructions, and contact confirmations now go to the new address.'),
        button('Check the reply address', `${siteUrl}/#admin/emails`),
        note('If you did not expect this change, check it now and change the admin passwords.'),
      ],
    }),
  }
}

// The order's items, without amounts: enough for the customer to recognise it.
const itemList = (order: OrderEmailData) => order.items.map((item) => `${item.quantity} × ${item.name} (${item.reference})`)

// Order updates staff choose to send (a checkbox, ticked by default, in the admin panel).
export type OrderUpdate = 'ready_for_pickup' | 'out_for_delivery' | 'completed' | 'cancelled' | 'transfer_not_received'

export function customerOrderUpdateEmail(order: OrderEmailData, update: OrderUpdate, siteUrl: string, collectionHours: string, testMode = false) {
  const ask = `If you have a question, reply to this email, or contact GPEC through ${siteUrl}/#enquiry and give your order reference.`
  const refundsPolicy = link('the refunds policy', `${siteUrl}/#refunds`)
  const content: Record<OrderUpdate, { subject: string, headline: string, lines: string[], blocks: Parameters<typeof emailPage>[0]['blocks'] }> = {
    ready_for_pickup: {
      subject: `Your GPEC order ${order.reference} is ready for pickup`,
      headline: 'Your order is ready for pickup',
      lines: [
        `Your order ${order.reference} is ready to collect from GPEC at ${PICKUP_LOCATION}. Collection hours: ${collectionHours}.`,
        'Please bring your order reference. If you cannot come during those hours, reply to this email to arrange another time.',
      ],
      blocks: [
        paragraph('Your order is ready to collect from GPEC.'),
        details([
          { label: 'Order reference', value: order.reference, code: true },
          { label: 'Where', value: PICKUP_LOCATION },
          { label: 'Collection hours', value: collectionHours },
        ]),
        paragraph('Please bring your order reference. If you cannot come during those hours, reply to this email to arrange another time.'),
      ],
    },
    out_for_delivery: {
      subject: `Your GPEC order ${order.reference} is on its way`,
      headline: 'Your order is on its way',
      lines: [`Your order ${order.reference} is out for delivery to the address you gave${order.deliveryArea ? ` (${order.deliveryArea.name})` : ''}.`],
      blocks: [
        paragraph(`Your order is out for delivery to the address you gave${order.deliveryArea ? ` (${order.deliveryArea.name})` : ''}.`),
        details([{ label: 'Order reference', value: order.reference, code: true }]),
      ],
    },
    completed: {
      subject: `Your GPEC order ${order.reference} is complete`,
      headline: 'Your order is complete',
      lines: [
        `GPEC has marked your order ${order.reference} as complete. Thank you for your order.`,
        `If you have not received everything on it, please reply to this email. Returns are covered by the refunds policy: ${siteUrl}/#refunds`,
      ],
      blocks: [
        paragraph('GPEC has marked your order as complete. Thank you for your order.'),
        details([{ label: 'Order reference', value: order.reference, code: true }]),
        paragraph(html`If you have not received everything on it, please reply to this email. Returns are covered by ${refundsPolicy}.`),
      ],
    },
    cancelled: {
      subject: `Your GPEC order ${order.reference} has been cancelled`,
      headline: 'Your order has been cancelled',
      lines: [
        `Your order ${order.reference} has been cancelled.`,
        `If you paid for it, GPEC will contact you about your refund, as set out in the refunds policy: ${siteUrl}/#refunds`,
      ],
      blocks: [
        details([{ label: 'Order reference', value: order.reference, code: true }]),
        paragraph(html`If you paid for it, GPEC will contact you about your refund, as set out in ${refundsPolicy}.`),
      ],
    },
    transfer_not_received: {
      subject: `Your GPEC order ${order.reference} has been closed`,
      headline: 'Your order has been closed',
      lines: [
        `GPEC has not received a bank transfer for your order ${order.reference}, so the order has been closed.`,
        'If you have sent the money, reply to this email with the date, the amount, and the bank you sent it from, so GPEC can look for it.',
        `To buy these items, you can place a new order at ${siteUrl}/#shop`,
      ],
      blocks: [
        paragraph('GPEC has not received a bank transfer for this order, so the order has been closed.'),
        details([{ label: 'Order reference', value: order.reference, code: true }]),
        paragraph('If you have sent the money, reply to this email with the date, the amount, and the bank you sent it from, so GPEC can look for it.'),
        button('Place a new order', `${siteUrl}/#shop`),
      ],
    },
  }
  const { subject, headline, lines, blocks } = content[update]
  return {
    subject,
    text: withTestNotice([CUSTOMER_GREETING, '', ...lines, '', ...itemList(order), '', ask, '', 'GPEC', siteUrl], testMode).join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'customer',
      testNotice: testNotice(testMode),
      preview: `An update on order ${order.reference}.`,
      headline,
      blocks: [paragraph('Hello,'), blocks, itemsBlock(order), replyNote(order, siteUrl)],
    }),
  }
}

export function staffOrderEmail(order: OrderEmailData, siteUrl: string, testMode = false) {
  return {
    subject: `New paid order ${order.reference}`,
    text: withTestNotice([
      order.paymentMethod === 'bank_transfer' ? 'A bank transfer for an order on the GPEC website has been confirmed as received.' : 'A customer has paid for an order on the GPEC website. Paystack confirmed the payment.',
      '',
      `Order: ${order.reference}`,
      ...(order.paidAt ? [`Paid: ${utcTime(order.paidAt)}`] : []),
      ...customerLines(order),
      '',
      ...orderLines(order),
      '',
      `Open it in the admin panel: ${siteUrl}/#admin/orders/${order.reference}`,
    ], testMode).join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'staff',
      testNotice: testNotice(testMode),
      preview: 'A customer has paid for an order.',
      headline: 'New paid order',
      blocks: [
        paragraph(order.paymentMethod === 'bank_transfer' ? 'A bank transfer for an order on the GPEC website has been confirmed as received.' : 'A customer has paid for an order on the GPEC website. Paystack confirmed the payment.'),
        highlight('Total paid', formatMoney(order.total, order.currency)),
        details([
          { label: 'Order', value: order.reference, code: true },
          order.paidAt ? { label: 'Paid', value: utcTime(order.paidAt) } : null,
        ]),
        button('Open in the admin panel', `${siteUrl}/#admin/orders/${order.reference}`),
        customerBlocks(order),
        heading('Order'),
        orderTableBlock(order),
      ],
    }),
  }
}

export function customerOrderEmail(order: OrderEmailData, siteUrl: string, collectionHours: string, testMode = false) {
  return {
    subject: `Your GPEC order ${order.reference} is paid`,
    text: withTestNotice([
      CUSTOMER_GREETING,
      '',
      `Thank you for your order. Your payment has been received and your order reference is ${order.reference}.`,
      '',
      ...orderLines(order),
      '',
      order.fulfilmentMethod === 'delivery'
        ? `GPEC will contact you to arrange delivery to the address you gave${order.deliveryArea ? ` (${order.deliveryArea.name})` : ''}.`
        : `Your order is for pickup from GPEC at ${PICKUP_LOCATION}. Collection hours: ${collectionHours}. GPEC will contact you when it is ready. Please bring your order reference.`,
      '',
      `If you have a question about your order, reply to this email, or contact GPEC through ${siteUrl}/#enquiry and give your order reference.`,
      '',
      'GPEC',
      siteUrl,
    ], testMode).join('\n'),
    html: emailPage({
      siteUrl,
      audience: 'customer',
      testNotice: testNotice(testMode),
      preview: 'Thank you for your order. Your payment has been received.',
      headline: 'Your payment has been received',
      blocks: [
        paragraph('Hello,'),
        paragraph('Thank you for your order.'),
        highlight('Total paid', formatMoney(order.total, order.currency)),
        details([
          { label: 'Order reference', value: order.reference, code: true },
          order.paidAt ? { label: 'Paid', value: utcTime(order.paidAt) } : null,
          order.fulfilmentMethod === 'delivery'
            ? { label: 'Delivery', value: order.deliveryArea?.name ?? 'To the address you gave' }
            : { label: 'Pickup from', value: PICKUP_LOCATION },
          order.fulfilmentMethod !== 'delivery' ? { label: 'Collection hours', value: collectionHours } : null,
        ]),
        heading('Your order'),
        orderTableBlock(order),
        paragraph(order.fulfilmentMethod === 'delivery'
          ? 'GPEC will contact you to arrange delivery to the address you gave.'
          : 'GPEC will contact you when it is ready. Please bring your order reference.'),
        replyNote(order, siteUrl),
      ],
    }),
  }
}
