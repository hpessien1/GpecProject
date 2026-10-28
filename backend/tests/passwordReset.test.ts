import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import AdminPasswordReset from '../src/models/AdminPasswordReset.js'
import AdminSession from '../src/models/AdminSession.js'
import AdminUser from '../src/models/AdminUser.js'
import { createPasswordReset, replacePassword, startSession } from '../src/services/adminAuth.js'
import type { BreachedPasswordCheck } from '../src/services/breachedPasswords.js'
import { hashPassword } from '../src/services/passwords.js'
import { EmailBudget } from '../src/utils/emailBudget.js'
import { RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const ORIGIN = 'http://localhost:5173'
const REQUEST = '/api/admin/session/password-reset'
const CONFIRM = '/api/admin/session/password-reset/confirm'
const NEW_PASSWORD = 'a brand new long passphrase'
const SAME_REPLY = { message: 'If this email address belongs to a GPEC admin account, a link to reset the password is on its way. It works for 30 minutes. Check the spam folder if it does not arrive.' }

function emailApp(mailer = new RecordingMailer(), breachCheck?: BreachedPasswordCheck) {
  return { mailer, app: testApp({ email: TEST_EMAIL_SETTINGS }, mailer, breachCheck) }
}

function askForLink(app: ReturnType<typeof testApp>, email: unknown) {
  return request(app).post(REQUEST).set('Origin', ORIGIN).send({ email })
}

function confirm(app: ReturnType<typeof testApp>, body: object) {
  return request(app).post(CONFIRM).set('Origin', ORIGIN).send(body)
}

function tokenFrom(text: string) {
  return /#admin\/reset-password\/([\w-]{43})/.exec(text)?.[1] ?? ''
}

function logIn(app: ReturnType<typeof testApp>, password: string) {
  return request(app).post('/api/admin/session').set('Origin', ORIGIN).send({ email: TEST_ADMIN.email, password })
}

describe('asking for a reset link', () => {
  it('emails the admin a link to the site, and stores only a hash of its token', async () => {
    await createTestAdmin()
    const { mailer, app } = emailApp()
    const res = await askForLink(app, 'ADMIN@example.test')
    expect(res.status).toBe(202)
    expect(res.body).toEqual(SAME_REPLY)
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    const [email] = mailer.sent
    expect(email.to).toEqual([TEST_ADMIN.email])
    expect(email.subject).toBe('Reset your GPEC admin password')
    expect(email.text).toContain(`${TEST_EMAIL_SETTINGS.siteUrl}/#admin/reset-password/`)
    const token = tokenFrom(email.text)
    const stored = await AdminPasswordReset.findOne().lean()
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored?.tokenHash).not.toBe(token)
    const minutesLeft = ((stored?.expiresAt.getTime() ?? 0) - Date.now()) / 60_000
    expect(minutesLeft).toBeGreaterThan(29)
    expect(minutesLeft).toBeLessThanOrEqual(30)
  })

  it('gives the same answer for an unknown or deactivated address, and creates no link for them', async () => {
    await createTestAdmin({ email: 'former@example.test', isActive: false })
    const { app } = emailApp()
    for (const address of ['nobody@example.test', 'former@example.test']) {
      const res = await askForLink(app, address)
      expect(res.status).toBe(202)
      expect(res.body).toEqual(SAME_REPLY)
      expect(await createPasswordReset(address)).toBeNull()
    }
    expect(await AdminPasswordReset.countDocuments()).toBe(0)
  })

  it('cancels the earlier link when a new one is asked for', async () => {
    await createTestAdmin()
    const first = await createPasswordReset(TEST_ADMIN.email)
    const second = await createPasswordReset(TEST_ADMIN.email)
    expect(await AdminPasswordReset.countDocuments()).toBe(1)
    const { app } = emailApp()
    expect((await confirm(app, { token: first?.token, newPassword: NEW_PASSWORD })).body.code).toBe('RESET_LINK_INVALID')
    expect((await confirm(app, { token: second?.token, newPassword: NEW_PASSWORD })).status).toBe(204)
  })

  it('emails one address at most 3 times an hour, without cancelling the last link sent', async () => {
    await createTestAdmin()
    const { mailer, app } = emailApp()
    for (let i = 0; i < 5; i += 1) expect((await askForLink(app, TEST_ADMIN.email)).status).toBe(202)
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(3))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(mailer.sent).toHaveLength(3)
    const lastToken = tokenFrom(mailer.sent[2].text)
    expect((await confirm(app, { token: lastToken, newPassword: NEW_PASSWORD })).status).toBe(204)
  })

  // Audit L-02: a made-up address is looked up and dropped, never kept in the hourly count.
  it('does not count or keep an address that is not an active admin’s', async () => {
    await createTestAdmin({ email: 'former@example.test', isActive: false })
    await createTestAdmin()
    const take = vi.spyOn(EmailBudget.prototype, 'take')
    const { mailer, app } = emailApp()
    for (const address of ['nobody@example.test', 'former@example.test', 'nobody2@example.test']) expect((await askForLink(app, address)).status).toBe(202)
    await askForLink(app, TEST_ADMIN.email)
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    expect(take.mock.calls).toEqual([[TEST_ADMIN.email]])
    take.mockRestore()
  })

  it('handles requests arriving together in order, so the last email’s link is the one that works', async () => {
    await createTestAdmin()
    const { mailer, app } = emailApp()
    await Promise.all([1, 2, 3].map(() => askForLink(app, TEST_ADMIN.email)))
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(3))
    const tokens = mailer.sent.map((message) => tokenFrom(message.text))
    expect((await confirm(app, { token: tokens[0], newPassword: NEW_PASSWORD })).body.code).toBe('RESET_LINK_INVALID')
    expect((await confirm(app, { token: tokens[1], newPassword: NEW_PASSWORD })).body.code).toBe('RESET_LINK_INVALID')
    expect((await confirm(app, { token: tokens[2], newPassword: NEW_PASSWORD })).status).toBe(204)
  })

  it('refuses a missing or invalid address, and an object instead of text', async () => {
    const { app } = emailApp()
    for (const email of ['', 'not-an-email', { $gt: '' }]) {
      const res = await askForLink(app, email)
      expect(res.status).toBe(400)
      expect(Object.keys(res.body.errors)).toEqual(['email'])
    }
  })

  it('answers 503 when email is not set up, so staff are told to ask the site administrator', async () => {
    const res = await askForLink(testApp(), TEST_ADMIN.email)
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('PASSWORD_RESET_UNAVAILABLE')
  })

  it('counts every request against its own per-visitor limit', async () => {
    const { mailer } = emailApp()
    const app = testApp({ email: TEST_EMAIL_SETTINGS, adminLoginRateLimit: { windowMs: 60_000, limit: 2 } }, mailer)
    expect((await askForLink(app, 'a@example.test')).status).toBe(202)
    expect((await askForLink(app, 'b@example.test')).status).toBe(202)
    const res = await askForLink(app, 'c@example.test')
    expect(res.status).toBe(429)
    expect(res.body.message).toBe('Too many reset requests. Please wait 15 minutes and try again.')
  })
})

describe('using a reset link', () => {
  it('sets the new password, ends every session, uses up the link, and tells the admin by email', async () => {
    await createTestAdmin()
    const { mailer, app } = emailApp()
    await loggedInAgent(app)
    await loggedInAgent(app)
    const reset = await createPasswordReset(TEST_ADMIN.email)
    const res = await confirm(app, { token: reset?.token, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(204)
    expect(String(res.headers['set-cookie'])).toMatch(/^gpec_admin_session=;/)
    expect(await AdminSession.countDocuments()).toBe(0)
    expect(await AdminPasswordReset.countDocuments()).toBe(0)
    expect((await logIn(app, TEST_ADMIN.password)).status).toBe(401)
    expect((await logIn(app, NEW_PASSWORD)).status).toBe(200)
    await vi.waitFor(() => expect(mailer.sent).toHaveLength(1))
    expect(mailer.sent[0]).toMatchObject({ to: [TEST_ADMIN.email], subject: 'Your GPEC admin password was changed' })

    const again = await confirm(app, { token: reset?.token, newPassword: 'yet another long passphrase' })
    expect(again.status).toBe(400)
    expect(again.body).toMatchObject({ code: 'RESET_LINK_INVALID', message: 'This reset link has expired or has already been used. Ask for a new one.' })
  })

  it('works only once when the same link is sent twice at the same moment', async () => {
    await createTestAdmin()
    const { app } = emailApp()
    const reset = await createPasswordReset(TEST_ADMIN.email)
    const results = await Promise.all([
      confirm(app, { token: reset?.token, newPassword: NEW_PASSWORD }),
      confirm(app, { token: reset?.token, newPassword: 'a different long passphrase' }),
    ])
    expect(results.map((res) => res.status).sort()).toEqual([204, 400])
  })

  it('refuses an expired link', async () => {
    await createTestAdmin()
    const { app } = emailApp()
    const reset = await createPasswordReset(TEST_ADMIN.email)
    await AdminPasswordReset.updateMany({}, { expiresAt: new Date(Date.now() - 1000) })
    const res = await confirm(app, { token: reset?.token, newPassword: NEW_PASSWORD })
    expect(res.body.code).toBe('RESET_LINK_INVALID')
    expect((await logIn(app, TEST_ADMIN.password)).status).toBe(200)
  })

  it('refuses a link for an account deactivated after it was sent', async () => {
    const admin = await createTestAdmin()
    const { app } = emailApp()
    const reset = await createPasswordReset(TEST_ADMIN.email)
    admin.isActive = false
    await admin.save()
    expect((await confirm(app, { token: reset?.token, newPassword: NEW_PASSWORD })).body.code).toBe('RESET_LINK_INVALID')
  })

  it('refuses an unknown, malformed, or non-text token', async () => {
    await createTestAdmin()
    const { app } = emailApp()
    for (const token of ['A'.repeat(43), 'too-short', { $ne: '' }]) {
      const res = await confirm(app, { token, newPassword: NEW_PASSWORD })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('RESET_LINK_INVALID')
    }
  })

  it('refuses a short password and keeps the link usable', async () => {
    await createTestAdmin()
    const { app } = emailApp()
    const reset = await createPasswordReset(TEST_ADMIN.email)
    const res = await confirm(app, { token: reset?.token, newPassword: 'too short' })
    expect(res.status).toBe(400)
    expect(Object.keys(res.body.errors)).toEqual(['newPassword'])
    expect((await confirm(app, { token: reset?.token, newPassword: NEW_PASSWORD })).status).toBe(204)
  })

  it('refuses a password known from a breach and keeps the link usable', async () => {
    await createTestAdmin()
    const breached: BreachedPasswordCheck = { isBreached: async (password) => password === NEW_PASSWORD }
    const { app } = emailApp(new RecordingMailer(), breached)
    const reset = await createPasswordReset(TEST_ADMIN.email)
    const res = await confirm(app, { token: reset?.token, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PASSWORD_BREACHED')
    expect((await confirm(app, { token: reset?.token, newPassword: 'an unbreached long passphrase' })).status).toBe(204)
  })

  it('stops working once the password is changed in the admin panel', async () => {
    await createTestAdmin()
    const { app } = emailApp()
    const reset = await createPasswordReset(TEST_ADMIN.email)
    const agent = await loggedInAgent(app)
    await agent.post('/api/admin/session/password').set('Origin', ORIGIN).send({ currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD }).expect(204)
    expect((await confirm(app, { token: reset?.token, newPassword: 'an attacker long passphrase' })).body.code).toBe('RESET_LINK_INVALID')
    expect((await logIn(app, NEW_PASSWORD)).status).toBe(200)
  })

  it('stops working, with every session, once the password is reset by the admin:create command', async () => {
    const admin = await createTestAdmin()
    const { app } = emailApp()
    const reset = await createPasswordReset(TEST_ADMIN.email)
    const agent = await loggedInAgent(app)
    expect(await replacePassword(admin._id, await hashPassword(NEW_PASSWORD))).toBe(true)
    expect((await agent.get('/api/admin/session')).status).toBe(401)
    expect((await confirm(app, { token: reset?.token, newPassword: 'an attacker long passphrase' })).body.code).toBe('RESET_LINK_INVALID')
    expect((await AdminUser.findById(admin._id).lean())?.passwordChangedAt).toBeInstanceOf(Date)
    expect((await logIn(app, NEW_PASSWORD)).status).toBe(200)
  })

  it('refuses a session started under the old password while the new one was being set', async () => {
    const admin = await createTestAdmin()
    const { app } = emailApp()
    // A login checks the password, then starts the session; a reset can land in between.
    const versionAtLogin = admin.credentialVersion
    const reset = await createPasswordReset(TEST_ADMIN.email)
    await confirm(app, { token: reset?.token, newPassword: NEW_PASSWORD }).expect(204)
    const token = await startSession(admin._id, versionAtLogin)
    const res = await request(app).get('/api/admin/session').set('Cookie', `gpec_admin_session=${token}`)
    expect(res.status).toBe(401)
  })

  it('limits refused links per visitor, but not too-short passwords', async () => {
    await createTestAdmin()
    const app = testApp({ email: TEST_EMAIL_SETTINGS, adminLoginRateLimit: { windowMs: 60_000, limit: 2 } }, new RecordingMailer())
    const reset = await createPasswordReset(TEST_ADMIN.email)
    for (let i = 0; i < 3; i += 1) expect((await confirm(app, { token: reset?.token, newPassword: 'short' })).status).toBe(400)
    expect((await confirm(app, { token: 'B'.repeat(43), newPassword: NEW_PASSWORD })).status).toBe(400)
    expect((await confirm(app, { token: 'C'.repeat(43), newPassword: NEW_PASSWORD })).status).toBe(400)
    const res = await confirm(app, { token: reset?.token, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(429)
    expect(res.body.message).toBe('Too many attempts with reset links. Please wait 15 minutes and try again.')
  })
})
