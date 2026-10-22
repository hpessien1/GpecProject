import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import ContactRequest from '../src/models/ContactRequest.js'
import { RecordingMailer, TEST_EMAIL_SETTINGS, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
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
    expect(customer.replyTo).toBeUndefined()
  })

  it('never puts customer input in a subject line', async () => {
    const mailer = new RecordingMailer()
    await request(testApp({ email: TEST_EMAIL_SETTINGS }, mailer)).post('/api/contact-requests').send({ ...contact(), fullName: 'Evil\nBcc: victim@example.org' })
    for (const email of await emailsSent(mailer, 2)) expect(email.subject).not.toMatch(/Evil|victim/)
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
