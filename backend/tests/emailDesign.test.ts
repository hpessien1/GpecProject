import { SESv2Client } from '@aws-sdk/client-sesv2'
import { describe, expect, it, vi } from 'vitest'
import { sesMailer } from '../src/services/email.js'
import { button, link, quotedBlock } from '../src/services/emailLayout.js'
import { adminAccountCodeEmail, adminLoginCodeEmail, adminLoginPausedEmail, adminPasswordChangedEmail, adminPasswordResetEmail, adminRecoveryCodeUsedEmail, adminRecoveryCodesReplacedEmail, adminTwoFactorChangedEmail, bankDetailsChangedEmail, customerContactEmail, customerOrderEmail, customerOrderUpdateEmail, customerTransferOrderEmail, replyToChangedEmail, staffContactEmail, staffOrderEmail, staffTransferOrderEmail, staffTransferReportedEmail, staffUnmatchedPaymentEmail } from '../src/services/emailTemplates.js'
import type { OrderEmailData } from '../src/services/emailTemplates.js'
import { createNotifier } from '../src/services/notifications.js'
import { RecordingMailer, TEST_EMAIL_SETTINGS } from './helpers.js'

const SITE = 'https://www.example.com'
const LOGO = `${SITE}/assets/gpec-email-logo.png`
const TEST_BANNER = 'TEST ORDER'

// Markup someone might type into a form, trying to change how the email looks or what it links to.
const NASTY = '<script>alert(1)</script><img src=x onerror=alert(1)><a href="https://evil.example">Click</a>" onmouseover="alert(1)\'&'
const admin = { name: NASTY, email: 'admin@example.com' }
const order: OrderEmailData = {
  reference: 'GPEC-O-2026-0000000A',
  paidAt: new Date('2026-10-31T10:00:00Z'),
  createdAt: new Date('2026-10-31T09:00:00Z'),
  customer: { fullName: NASTY, company: NASTY, email: 'customer@example.com', phone: NASTY },
  items: [{ name: NASTY, reference: 'GPEC-X-1', unitPrice: 1000, quantity: 2, lineTotal: 2000 }],
  fulfilmentMethod: 'delivery',
  deliveryAddress: `${NASTY}\n${NASTY}`,
  deliveryArea: { name: NASTY },
  customerNotes: NASTY,
  paymentMethod: 'paystack',
  currency: 'NGN',
  subtotal: 2000,
  deliveryFee: 300,
  paystackFee: 100,
  total: 2400,
}
const transfer: OrderEmailData = { ...order, paymentMethod: 'bank_transfer', bankTransfer: { bankName: NASTY, accountName: NASTY, accountNumber: '0123456789', instructions: NASTY, payWithinDays: 3, isSample: true } }
const contact = { reference: 'GPEC-C-2026-0000000A', createdAt: new Date('2026-10-31T09:00:00Z'), fullName: NASTY, company: NASTY, email: 'customer@example.com', phone: NASTY, subject: NASTY, message: `${NASTY}\n\n${NASTY}`, files: 2 }

const EVERY_EMAIL: [string, () => { subject: string, text: string, html: string }][] = [
  ['staff contact', () => staffContactEmail(contact, SITE)],
  ['customer contact', () => customerContactEmail(contact, SITE)],
  ['password reset', () => adminPasswordResetEmail(admin, `${SITE}/#admin/reset-password/token`, 30, SITE)],
  ['password changed', () => adminPasswordChangedEmail(admin, 'panel', SITE)],
  ['login code', () => adminLoginCodeEmail(admin, '123456', 10, SITE)],
  ['account code', () => adminAccountCodeEmail(admin, '123456', 10, SITE)],
  ['two-step on', () => adminTwoFactorChangedEmail(admin, { on: true, method: 'app' }, SITE)],
  ['two-step off', () => adminTwoFactorChangedEmail(admin, { on: false }, SITE)],
  ['recovery codes replaced', () => adminRecoveryCodesReplacedEmail(admin, SITE)],
  ['login paused', () => adminLoginPausedEmail(admin, 10, new Date(), SITE)],
  ['recovery code used', () => adminRecoveryCodeUsedEmail(admin, 3, SITE)],
  ['customer transfer', () => customerTransferOrderEmail(transfer, SITE, `${SITE}/#shop/payment/abc`, true)],
  ['staff transfer', () => staffTransferOrderEmail(transfer, SITE, true)],
  ['transfer reported', () => staffTransferReportedEmail(transfer, SITE, true)],
  ['unmatched payment', () => staffUnmatchedPaymentEmail({ reference: NASTY, amount: 100, currency: NASTY, reason: 'no_order' }, SITE)],
  ['bank details changed', () => bankDetailsChangedEmail(admin, [NASTY], { enabled: true, bankName: NASTY, accountName: NASTY, accountNumber: NASTY }, SITE)],
  ['reply-to changed', () => replyToChangedEmail(admin, NASTY, NASTY, SITE)],
  ['staff order', () => staffOrderEmail(order, SITE, true)],
  ['customer order, delivery', () => customerOrderEmail(order, SITE, NASTY, true)],
  ['customer order, pickup', () => customerOrderEmail({ ...order, fulfilmentMethod: 'pickup' }, SITE, NASTY, true)],
  ...(['ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'transfer_not_received'] as const).map((update): [string, () => { subject: string, text: string, html: string }] => [update, () => customerOrderUpdateEmail(order, update, SITE, NASTY, true)]),
]

describe.each(EVERY_EMAIL)('the designed email: %s', (_name, build) => {
  it('turns nothing anyone typed into markup, and links only to the site', () => {
    const { html, text } = build()
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<img\s+src=x/i)
    expect(html).not.toMatch(/" onmouseover=/i)
    expect(html).not.toContain('evil.example">')
    for (const [, href] of html.matchAll(/<a\s+href="([^"]*)"/g)) expect(href?.startsWith(SITE)).toBe(true)
    // Only the logo is an image: nothing that loads from elsewhere, and nothing that tracks.
    expect([...html.matchAll(/<img\s+src="([^"]*)"/g)].map((match) => match[1])).toEqual([LOGO])
    expect(html).toContain('alt="GPEC Engineering"')
    // The plain-text copy goes with it.
    expect(text.length).toBeGreaterThan(0)
  })
})

describe('the designed emails', () => {
  it.each([
    ['login code', adminLoginCodeEmail],
    ['account code', adminAccountCodeEmail],
  ])('keeps the %s out of the subject and of the preview a lock screen shows', (_name, build) => {
    const { subject, html } = build({ name: 'Ada', email: 'a@example.com' }, '654321', 10, SITE)
    expect(subject).not.toContain('654321')
    const preview = /<div style="display:none[^>]*>(.*?)<\/div>/s.exec(html)?.[1] ?? ''
    expect(preview.length).toBeGreaterThan(0)
    expect(preview).not.toContain('654321')
    expect(html).toContain('654321')
  })

  it('shows the customer no name in their own emails: a form can be sent with a stranger\'s address', () => {
    const named = { ...order, customer: { ...order.customer, fullName: 'Ada Stranger' } }
    expect(customerOrderEmail(named, SITE, '9am to 5pm').html).not.toContain('Ada Stranger')
    expect(customerOrderUpdateEmail(named, 'completed', SITE, '9am to 5pm').html).not.toContain('Ada Stranger')
    expect(customerContactEmail({ ...contact, fullName: 'Ada Stranger' }, SITE).html).not.toContain('Ada Stranger')
  })

  it('marks what a customer typed as theirs, line by line', () => {
    const block = quotedBlock('Message, as the customer typed it', 'one\ntwo').value
    expect(block).toContain('as the customer typed it')
    expect(block).toContain('one<br>two')
  })

  it('warns about sample bank details, and not about real ones', () => {
    expect(customerTransferOrderEmail(transfer, SITE, SITE).html).toContain('DO NOT SEND MONEY')
    const real = { ...transfer, bankTransfer: { ...transfer.bankTransfer!, isSample: false } }
    expect(customerTransferOrderEmail(real, SITE, SITE).html).not.toContain('DO NOT SEND MONEY')
  })

  it('leaves out the Paystack fee line on bank transfers', () => {
    expect(customerOrderEmail(order, SITE, '9am').html).toContain('Payment processing fee')
    expect(customerOrderEmail(transfer, SITE, '9am').html).not.toContain('Payment processing fee')
  })

  it('makes no link or button out of anything but a web address', () => {
    expect(link('Click', 'javascript:alert(1)').value).toBe('Click')
    expect(button('Click', 'javascript:alert(1)').value).not.toContain('<a')
    expect(link('Click', `${SITE}/"><b>`).value).not.toContain('<b>')
  })
})

describe('the test order banner', () => {
  const hours = async () => '9am to 5pm'
  const replyTo = async () => 'reply@example.com'
  async function everyOrderEmail(testMode: boolean) {
    const mailer = new RecordingMailer()
    const notifier = createNotifier(mailer, TEST_EMAIL_SETTINGS, replyTo, hours, testMode)
    await notifier.orderPaid(order)
    await notifier.transferOrderPlaced({ ...transfer, _id: 'abc' })
    await notifier.transferReported(transfer)
    await notifier.orderUpdate(order, 'completed')
    return mailer.sent
  }

  it('is on every order email while Paystack is on test keys, in both versions', async () => {
    const sent = await everyOrderEmail(true)
    expect(sent.length).toBe(6)
    for (const email of sent) {
      expect(email.html).toContain(TEST_BANNER)
      expect(email.text).toContain(TEST_BANNER)
    }
  })

  it('is on none of them with live keys', async () => {
    const sent = await everyOrderEmail(false)
    expect(sent.length).toBe(6)
    for (const email of sent) {
      expect(email.html).not.toContain(TEST_BANNER)
      expect(email.text).not.toContain(TEST_BANNER)
    }
  })

  it('is on no email that is not about an order', async () => {
    const mailer = new RecordingMailer()
    const notifier = createNotifier(mailer, TEST_EMAIL_SETTINGS, replyTo, hours, true)
    await notifier.contactRequestReceived(contact)
    await notifier.loginCode({ name: 'Ada', email: 'a@example.com' }, '123456', 10)
    expect(mailer.sent.length).toBe(3)
    for (const email of mailer.sent) expect(email.html).not.toContain(TEST_BANNER)
  })
})

describe('sending through Amazon SES', () => {
  it('sends both versions, so mail apps can choose', async () => {
    const send = vi.spyOn(SESv2Client.prototype, 'send').mockImplementation(async () => ({}))
    await sesMailer(TEST_EMAIL_SETTINGS).send({ to: ['a@example.com'], subject: 'Hello', text: 'plain', html: '<p>designed</p>' })
    const command = send.mock.calls[0]?.[0] as unknown as { input: { Content: { Simple: { Body: unknown } } } } | undefined
    expect(command?.input.Content.Simple.Body).toEqual({ Text: { Data: 'plain', Charset: 'UTF-8' }, Html: { Data: '<p>designed</p>', Charset: 'UTF-8' } })
    send.mockRestore()
  })
})
