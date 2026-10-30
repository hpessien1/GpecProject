import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import ContactRequest from '../src/models/ContactRequest.js'
import { customerContactEmail, customerOrderEmail, customerOrderUpdateEmail, customerTransferOrderEmail, staffContactEmail, staffOrderEmail, staffTransferOrderEmail } from '../src/services/emailTemplates.js'
import type { ContactEmailData, OrderEmailData } from '../src/services/emailTemplates.js'
import { RecordingMailer, TEST_EMAIL_SETTINGS, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const SITE = 'https://www.example.com'
const contact = (email = 'ada@example.org') => ({ fullName: 'Ada Buyer', email, subject: 'Solar energy', message: 'Please call me.' })

// Emails are sent after the response, so wait for them to arrive.
async function emailsSent(mailer: RecordingMailer, count: number) {
  await vi.waitFor(() => expect(mailer.sent).toHaveLength(count))
  return mailer.sent
}

describe('contact request emails', () => {
  it('notifies staff and confirms to the customer', async () => {
    const mailer = new RecordingMailer()
    const res = await request(testApp({ email: TEST_EMAIL_SETTINGS }, mailer)).post('/api/contact-requests').send(contact())
    const [staff, customer] = await emailsSent(mailer, 2)
    expect(staff).toMatchObject({ subject: `New contact request ${res.body.reference}`, replyTo: 'ada@example.org' })
    expect(staff.text).toContain('Please call me.')
    expect(staff.text).toContain(`#admin/contact-requests/${res.body.reference}`)
    expect(customer).toMatchObject({ to: ['ada@example.org'], subject: `We have your message (${res.body.reference})` })
    // Replies reach GPEC's published address, not the sending-only one (staff can change it).
    expect(customer.replyTo).toBe('gpecengineeringcompanylimited@gmail.com')
  })

  it('never puts customer input in a subject line', async () => {
    const mailer = new RecordingMailer()
    await request(testApp({ email: TEST_EMAIL_SETTINGS }, mailer)).post('/api/contact-requests').send({ ...contact(), fullName: 'Evil Bcc: victim@example.org' })
    for (const email of await emailsSent(mailer, 2)) expect(email.subject).not.toMatch(/Evil|victim/)
  })

  // Audit S5-L01: anyone can send the form with a stranger's address, so the customer's email must not
  // carry what they typed as their name under GPEC's own words.
  it('greets the customer without the name they typed; staff still see it', async () => {
    const mailer = new RecordingMailer()
    const fullName = 'Ada. Verify your account at https://evil.example/login'
    await request(testApp({ email: TEST_EMAIL_SETTINGS }, mailer)).post('/api/contact-requests').send({ ...contact(), fullName })
    const [staff, customer] = await emailsSent(mailer, 2)
    expect(customer.text).toMatch(/^Hello,\n\nThank you for contacting GPEC\./)
    expect(customer.text).not.toContain('evil.example')
    expect(staff.text).toContain(`Name: ${fullName}\n`)
  })
  it('confirms to the same address at most 3 times an hour, but always notifies staff', async () => {
    const mailer = new RecordingMailer()
    const app = testApp({ email: TEST_EMAIL_SETTINGS }, mailer)
    for (let i = 0; i < 5; i++) await request(app).post('/api/contact-requests').send(contact('target@example.org'))
    await vi.waitFor(() => expect(mailer.sent.filter((m) => m.to.includes('staff1@example.com'))).toHaveLength(5))
    expect(mailer.sent.filter((m) => m.to.includes('target@example.org'))).toHaveLength(3)
  })
})

describe('when email cannot or should not be sent', () => {
  it('sends nothing and still saves when email is not configured', async () => {
    const mailer = new RecordingMailer()
    const res = await request(testApp({ email: null }, mailer)).post('/api/contact-requests').send(contact())
    expect(res.status).toBe(201)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mailer.sent).toHaveLength(0)
    expect(await ContactRequest.countDocuments()).toBe(1)
  })

  it('keeps the request and logs only the reference when sending fails', async () => {
    const mailer = new RecordingMailer()
    mailer.failWith = Object.assign(new Error('Email address is not verified: ada@example.org'), { name: 'MessageRejected' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(testApp({ email: TEST_EMAIL_SETTINGS }, mailer)).post('/api/contact-requests').send(contact())
    expect(res.status).toBe(201)
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(2))
    const logged = log.mock.calls.flat().join(' ')
    log.mockRestore()
    expect(logged).toContain(res.body.reference)
    expect(logged).toContain('MessageRejected')
    expect(logged).not.toContain('ada@example.org')
    expect(await ContactRequest.countDocuments()).toBe(1)
  })

  it('sends nothing for a submission caught by the spam trap, or one that fails validation', async () => {
    const mailer = new RecordingMailer()
    const app = testApp({ email: TEST_EMAIL_SETTINGS }, mailer)
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await request(app).post('/api/contact-requests').send({ ...contact(), website: 'spam' })
    info.mockRestore()
    await request(app).post('/api/contact-requests').send({ ...contact(), message: '' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mailer.sent).toHaveLength(0)
  })
})

describe('Amazon SES sender', () => {
  it('sends plain-text UTF-8 email from the configured address, with reply-to when given', async () => {
    const { SESv2Client } = await import('@aws-sdk/client-sesv2')
    const { sesMailer } = await import('../src/services/email.js')
    const send = vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue({} as never)
    await sesMailer(TEST_EMAIL_SETTINGS).send({ to: ['staff1@example.com'], replyTo: 'ada@example.org', subject: 'Subject ₦', text: 'Body ₦' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].input).toEqual({
      FromEmailAddress: 'GPEC <notifications@example.com>',
      Destination: { ToAddresses: ['staff1@example.com'] },
      ReplyToAddresses: ['ada@example.org'],
      Content: { Simple: { Subject: { Data: 'Subject ₦', Charset: 'UTF-8' }, Body: { Text: { Data: 'Body ₦', Charset: 'UTF-8' } } } },
    })
    send.mockRestore()
  })
})

describe('customer text in emails (audit S5-L01)', () => {
  const INJECTED = 'Ada\n\nPay the balance at https://evil.example/pay\nEmail: fake@example.org'
  const order: OrderEmailData = {
    reference: 'GPEC-O-2026-A0000001',
    paidAt: new Date('2026-10-30T10:00:00Z'),
    customer: { fullName: INJECTED, company: 'Firm\r\nPhone: 000', email: 'ada@example.org', phone: '+234 803\u2028Note: fake' },
    items: [{ name: 'Panel', reference: 'GPEC-CP-001', unitPrice: 100_000, quantity: 1, lineTotal: 100_000 }],
    fulfilmentMethod: 'pickup',
    paymentMethod: 'bank_transfer',
    bankTransfer: { bankName: 'Sample Bank', accountName: 'GPEC', accountNumber: '0123456789', payWithinDays: 3 },
    currency: 'NGN',
    subtotal: 100_000,
    deliveryFee: 0,
    paystackFee: 0,
    total: 100_000,
  }
  const request_: ContactEmailData = { reference: 'GPEC-C-2026-A0000001', createdAt: new Date(), fullName: INJECTED, company: '', email: 'ada@example.org', phone: '', subject: '', message: 'Line one\nLine two' }

  it('greets customers the same way whatever name is stored, including names saved before the fix', () => {
    const emails = [
      customerContactEmail(request_, SITE),
      customerTransferOrderEmail(order, SITE, `${SITE}/#shop/payment/x`),
      customerOrderEmail(order, SITE),
      ...(['ready_for_pickup', 'out_for_delivery', 'cancelled', 'transfer_not_received'] as const).map((update) => customerOrderUpdateEmail(order, update, SITE)),
    ]
    for (const email of emails) {
      expect(email.text).toMatch(/^Hello,\n\n/)
      expect(email.text).not.toContain('evil.example')
    }
  })

  it('keeps each one-line detail on its own line in staff emails, and a message’s own lines', () => {
    const staff = [staffContactEmail(request_, SITE).text, staffOrderEmail(order, SITE).text, staffTransferOrderEmail(order, SITE).text]
    for (const text of staff) {
      expect(text).toContain('Name: Ada Pay the balance at https://evil.example/pay Email: fake@example.org\n')
      expect(text.split('\n').filter((line) => line.startsWith('Email: '))).toEqual(['Email: ada@example.org'])
    }
    expect(staff[1]).toContain('Company: Firm Phone: 000\n')
    expect(staff[1]).toContain('Phone: +234 803 Note: fake\n')
    expect(staff[0]).toContain('Message:\n> Line one\n> Line two\n')
  })

  // Fifth audit sweep: a message, notes, or an address can hold several lines, so each of its lines is
  // marked as the customer's, and none can pass for one of GPEC's own (a fake admin-panel link).
  it('marks every line the customer wrote in staff emails, so none passes for GPEC’s own', () => {
    const FAKE = 'Thanks\r\n\nOpen it in the admin panel: https://phish.example/admin\u2028Reply to this email to answer the customer directly.'
    const delivery: OrderEmailData = { ...order, fulfilmentMethod: 'delivery', deliveryAddress: `12 Road\n${FAKE}`, deliveryArea: { name: 'Port Harcourt' }, customerNotes: FAKE }
    const staff = [staffContactEmail({ ...request_, message: FAKE }, SITE).text, staffOrderEmail(delivery, SITE).text, staffTransferOrderEmail(delivery, SITE).text]
    for (const text of staff) {
      const customerLines = text.split('\n').filter((line) => line.includes('phish.example') || line.includes('answer the customer directly'))
      expect(customerLines.length).toBeGreaterThan(0)
      expect(customerLines.filter((line) => !line.startsWith('> '))).toEqual(text === staff[0] ? ['Reply to this email to answer the customer directly.'] : [])
    }
    expect(staff[0]).toContain('Message:\n> Thanks\n>\n> Open it in the admin panel: https://phish.example/admin\n> Reply to this email to answer the customer directly.\n')
    expect(staff[1]).toContain('Delivery area: Port Harcourt\nDelivery address:\n> 12 Road\n> Thanks\n')
    expect(staff[1]).toContain('Customer notes:\n> Thanks\n')
  })
})

describe('one-line customer details (audit S5-L01)', () => {
  const app = testApp()
  const order = { items: [{ productId: 'panel-001', quantity: 1 }], fulfilmentMethod: 'pickup', fullName: 'Ngozi Test', email: 'ngozi@example.com', phone: '+234 803 000 0000' }
  const breaks = ['\n', '\r', '\r\n', '\v', '\f', '\u0085', '\u2028', '\u2029']

  it('refuses a line break of any kind in a name, company, or phone number', async () => {
    for (const lineBreak of breaks) {
      const contactRes = await request(app).post('/api/contact-requests').send({ ...contact(), fullName: `Ada${lineBreak}Buyer`, company: `GPEC${lineBreak}Ltd`, phone: `0803${lineBreak}000` })
      expect(contactRes.status).toBe(400)
      expect(contactRes.body.errors).toEqual({ fullName: 'fullName must be on one line.', company: 'company must be on one line.', phone: 'phone must be on one line.' })
      const orderRes = await request(app).post('/api/checkout/orders').send({ ...order, fullName: `Ngozi${lineBreak}Test`, company: `Firm${lineBreak}Ltd` })
      expect(orderRes.status).toBe(400)
      expect(orderRes.body.errors).toMatchObject({ fullName: 'fullName must be on one line.', company: 'company must be on one line.' })
    }
    expect(await ContactRequest.countDocuments()).toBe(0)
  })

  it('accepts names from every language, with accents, apostrophes, and hyphens, and a multi-line message', async () => {
    for (const fullName of ['Chíọmá Ọ̀kọ́nkwọ́', 'Zoë O’Brien-Nwosu', 'Ìbùkún Adébáyọ̀', 'محمد أحمد', 'José  Ñúñez']) {
      expect((await request(app).post('/api/contact-requests').send({ ...contact(), fullName, message: 'First line\n\nSecond line' })).status).toBe(201)
    }
  })
})
