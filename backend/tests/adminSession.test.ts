import { createHash } from 'node:crypto'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSession from '../src/models/AdminSession.js'
import AdminUser from '../src/models/AdminUser.js'
import SecurityEvent from '../src/models/SecurityEvent.js'
import { WRONG_PASSWORDS_PER_HOUR, createPasswordReset } from '../src/services/adminAuth.js'
import { RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()
const app = testApp()
const ORIGIN = 'http://localhost:5173'

function logIn(target: ReturnType<typeof testApp>, body: object) {
  return request(target).post('/api/admin/session').set('Origin', ORIGIN).send(body)
}

describe('admin login', () => {
  it('sets a session cookie that page scripts cannot read and other sites cannot send', async () => {
    await createTestAdmin()
    const res = await logIn(app, { email: 'ADMIN@example.test', password: TEST_ADMIN.password })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ admin: { name: TEST_ADMIN.name, email: TEST_ADMIN.email }, currency: { code: 'NGN', minorUnitDigits: 2 }, imageUploads: false, twoFactor: { enabled: false, prompt: true } })
    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toMatch(/^gpec_admin_session=[\w-]{43};/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/api/admin')
    expect(cookie).not.toContain('Secure')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('marks the cookie Secure in production', async () => {
    await createTestAdmin()
    const res = await logIn(testApp({ isProduction: true }), { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    expect(String(res.headers['set-cookie'])).toContain('Secure')
  })

  it('stores only a hash of the session token', async () => {
    await createTestAdmin()
    const res = await logIn(app, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    const token = String(res.headers['set-cookie']).split(';')[0].split('=')[1]
    const session = await AdminSession.findOne().lean()
    expect(session?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(session?.tokenHash).not.toBe(token)
  })

  it('gives the same answer for a wrong password, an unknown email, and a deactivated account', async () => {
    await createTestAdmin()
    await createTestAdmin({ email: 'former@example.test', isActive: false })
    const attempts = [
      { email: TEST_ADMIN.email, password: 'wrong password' },
      { email: 'nobody@example.test', password: TEST_ADMIN.password },
      { email: 'former@example.test', password: TEST_ADMIN.password },
    ]
    for (const attempt of attempts) {
      const res = await logIn(app, attempt)
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ message: 'Email or password is incorrect.', code: 'INVALID_CREDENTIALS' })
      expect(res.headers['set-cookie']).toBeUndefined()
    }
    expect(await AdminSession.countDocuments()).toBe(0)
  })

  it('rejects missing fields and query operators without checking a password', async () => {
    const res = await logIn(app, { email: { $ne: '' }, password: { $ne: '' } })
    expect(res.status).toBe(400)
    expect(res.body.errors).toEqual({ email: 'email is required.', password: 'password is required.' })
  })

  it('counts only failed attempts toward the login limit', async () => {
    await createTestAdmin()
    const limited = testApp({ adminLoginRateLimit: { windowMs: 60_000, limit: 2 } })
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await logIn(limited, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })).status).toBe(200)
    }
    expect((await logIn(limited, { email: TEST_ADMIN.email, password: 'wrong' })).status).toBe(401)
    expect((await logIn(limited, { email: TEST_ADMIN.email, password: 'wrong' })).status).toBe(401)
    const blocked = await logIn(limited, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    expect(blocked.status).toBe(429)
    expect(blocked.body.message).toBe('Too many failed login attempts. Please wait 15 minutes and try again.')
  })
})

// Audit S5-M01: the per-IP limit alone lets someone with many addresses keep guessing one account.
// Each test makes 10 to 20 password checks (scrypt) in a row: 3 to 5 s on this laptop (2026-10-30).
describe('wrong passwords per account, from every address together', { timeout: 30_000 }, () => {
  const RIGHT = { email: TEST_ADMIN.email, password: TEST_ADMIN.password }
  const WRONG = { email: TEST_ADMIN.email, password: 'a wrong guess at the password' }
  let mailer: RecordingMailer
  let mailing: ReturnType<typeof testApp>
  const pausedEmails = () => mailer.sent.filter((email) => email.subject === 'Login to your GPEC admin account is paused')
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
  const guess = async (times: number, target = mailing) => {
    for (let i = 0; i < times; i++) expect((await logIn(target, WRONG)).status).toBe(401)
  }

  beforeEach(async () => {
    mailer = new RecordingMailer()
    mailing = testApp({ email: TEST_EMAIL_SETTINGS }, mailer)
    await createTestAdmin()
  })

  it(`pauses the account after ${WRONG_PASSWORDS_PER_HOUR} wrong passwords in an hour, with the same answer as a wrong password`, async () => {
    await guess(WRONG_PASSWORDS_PER_HOUR - 1)
    expect((await logIn(mailing, RIGHT)).status).toBe(200)
    await guess(1)
    const refused = await logIn(mailing, RIGHT)
    expect(refused.status).toBe(401)
    expect(refused.body).toEqual({ message: 'Email or password is incorrect.', code: 'INVALID_CREDENTIALS' })
    expect(refused.headers['set-cookie']).toBeUndefined()
  })

  it('counts guesses from different addresses together', async () => {
    // Each app has its own per-IP limiter, as separate addresses would: none of them reaches its own.
    const sources = Array.from({ length: 5 }, () => testApp({ adminLoginRateLimit: { windowMs: 60_000, limit: 3 } }))
    for (const source of sources) await guess(2, source)
    expect((await logIn(testApp(), RIGHT)).status).toBe(401)
  })

  it('takes back a try for the right password, including one that waits for its two-step code', async () => {
    for (let i = 0; i < 5; i++) expect((await logIn(mailing, RIGHT)).status).toBe(200)
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { twoFactorMethod: 'email' })
    for (let i = 0; i < 5; i++) expect((await logIn(mailing, RIGHT)).body.twoFactorRequired).toBe(true)
    await guess(WRONG_PASSWORDS_PER_HOUR - 1)
    expect((await logIn(mailing, RIGHT)).status).toBe(200)
  })

  it('leaves other accounts alone', async () => {
    const other = 'other@example.test'
    await createTestAdmin({ email: other })
    await guess(WRONG_PASSWORDS_PER_HOUR - 1)
    for (let i = 0; i < WRONG_PASSWORDS_PER_HOUR; i++) expect((await logIn(mailing, { email: other, password: WRONG.password })).status).toBe(401)
    const counts = (await AdminUser.find().sort({ email: 1 }).lean()).map((admin) => [admin.email, admin.wrongPasswordsInWindow])
    expect(counts).toEqual([[TEST_ADMIN.email, WRONG_PASSWORDS_PER_HOUR - 1], [other, WRONG_PASSWORDS_PER_HOUR]])
    expect((await logIn(mailing, RIGHT)).status).toBe(200)
    expect((await logIn(mailing, { email: other, password: TEST_ADMIN.password })).status).toBe(401)
  })

  it('ends the pause when the hour is up', async () => {
    await guess(WRONG_PASSWORDS_PER_HOUR)
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { wrongPasswordWindowStart: new Date(Date.now() - 61 * 60 * 1000) })
    expect((await logIn(mailing, RIGHT)).status).toBe(200)
  })

  it('ends the pause when a reset link sets a new password', async () => {
    await guess(WRONG_PASSWORDS_PER_HOUR)
    const reset = await createPasswordReset(TEST_ADMIN.email)
    const newPassword = 'a brand new long passphrase'
    await request(mailing).post('/api/admin/session/password-reset/confirm').set('Origin', ORIGIN).send({ token: reset?.token, newPassword }).expect(204)
    expect((await logIn(mailing, { email: TEST_ADMIN.email, password: newPassword })).status).toBe(200)
  })

  it('emails the admin once when the account is paused, saying how to end it', async () => {
    await guess(WRONG_PASSWORDS_PER_HOUR + 3)
    expect((await logIn(mailing, RIGHT)).status).toBe(401)
    await settle()
    expect(pausedEmails()).toHaveLength(1)
    const [notice] = pausedEmails()
    expect(notice.to).toEqual([TEST_ADMIN.email])
    expect(notice.text).toContain(`${WRONG_PASSWORDS_PER_HOUR} wrong passwords`)
    expect(notice.text).toContain('(UTC)')
    expect(notice.text).toContain('https://www.example.com/#admin/forgot-password')
    expect(notice.text).not.toContain(WRONG.password)
  })

  it('lets only one of many guesses at the same moment take the last try', async () => {
    await guess(WRONG_PASSWORDS_PER_HOUR - 1)
    const answers = await Promise.all(Array.from({ length: 6 }, () => logIn(mailing, WRONG)))
    expect(answers.map((res) => res.status)).toEqual(Array(6).fill(401))
    expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.wrongPasswordsInWindow).toBe(WRONG_PASSWORDS_PER_HOUR)
    await settle()
    expect(pausedEmails()).toHaveLength(1)
    expect((await logIn(mailing, RIGHT)).status).toBe(401)
  })

  it('refuses the right password sent together with the guess that pauses the account', async () => {
    await guess(WRONG_PASSWORDS_PER_HOUR - 1)
    const answers = await Promise.all([logIn(mailing, WRONG), logIn(mailing, WRONG), logIn(mailing, RIGHT)])
    // The right password either came first (and gave its try back) or found the account paused.
    const count = (await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.wrongPasswordsInWindow
    expect([[200, WRONG_PASSWORDS_PER_HOUR], [401, WRONG_PASSWORDS_PER_HOUR]]).toContainEqual([answers[2].status, count])
    expect((await logIn(mailing, RIGHT)).status).toBe(401)
  })

  it('keeps nothing for addresses that are not an admin’s', async () => {
    for (let i = 0; i < WRONG_PASSWORDS_PER_HOUR + 2; i++) expect((await logIn(mailing, { email: `nobody${i}@example.test`, password: 'guess' })).status).toBe(401)
    expect(await AdminUser.countDocuments()).toBe(1)
    expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.wrongPasswordsInWindow ?? 0).toBe(0)
  })

  it('records the pause in the security log', async () => {
    await guess(WRONG_PASSWORDS_PER_HOUR)
    await logIn(mailing, RIGHT)
    await settle()
    const reasons = (await SecurityEvent.find({ action: 'login.password' }).sort({ _id: 1 }).lean()).map((event) => event.reason)
    expect(reasons.slice(-2)).toEqual(['LOGIN_PAUSED_NOW', 'LOGIN_PAUSED'])
  })

  // Fifth audit sweep: the password asked again inside the panel is counted the same way, so someone
  // with a copied session cannot guess it from many addresses either.
  describe('the password asked again inside the panel', () => {
    const REPLY_TO = '/api/admin/customer-email'
    const ACCOUNT = '/api/admin/account/two-factor'
    const PAUSED = /^Too many wrong passwords have been entered for your account in the last hour, so logging in and changes that need your password are paused until .+ \(UTC\)\. To end the pause now, set a new password with “Forgot your password\?” on the login page\.$/
    let agent: Awaited<ReturnType<typeof loggedInAgent>>
    const confirm = (password: string) => agent.patch(REPLY_TO).set('Origin', ORIGIN).send({ replyTo: 'replies@example.org', password })

    beforeEach(async () => {
      agent = await loggedInAgent(mailing)
    })

    it('counts wrong ones toward the same tries as login', async () => {
      for (let i = 0; i < WRONG_PASSWORDS_PER_HOUR - 1; i++) expect((await confirm(WRONG.password)).body.code).toBe('WRONG_PASSWORD')
      await guess(1)
      expect((await logIn(mailing, RIGHT)).status).toBe(401)
    })

    it('says openly that the account is paused, on the password field, and changes nothing', async () => {
      await guess(WRONG_PASSWORDS_PER_HOUR)
      const res = await confirm(TEST_ADMIN.password)
      expect(res.status).toBe(429)
      expect(res.body.code).toBe('PASSWORD_PAUSED')
      expect(res.body.message).toMatch(PAUSED)
      expect(res.body.errors.password).toBe(res.body.message)
      expect((await agent.get(REPLY_TO)).body.settings.replyTo).not.toBe('replies@example.org')
    })

    it('refuses a password change in the panel while paused, on the current password', async () => {
      await guess(WRONG_PASSWORDS_PER_HOUR)
      const res = await agent.post('/api/admin/session/password').set('Origin', ORIGIN).send({ currentPassword: TEST_ADMIN.password, newPassword: 'a brand new long passphrase' })
      expect(res.status).toBe(429)
      expect(res.body.errors.currentPassword).toMatch(PAUSED)
      expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.passwordChangedAt ?? null).toBeNull()
    })

    it('refuses turning two-step login on or off while paused, without using up a recovery code', async () => {
      await agent.post(`${ACCOUNT}/app`).set('Origin', ORIGIN).expect(200)
      await guess(WRONG_PASSWORDS_PER_HOUR)
      const enable = await agent.post(`${ACCOUNT}/enable`).set('Origin', ORIGIN).send({ method: 'app', password: TEST_ADMIN.password, code: '123456' })
      expect(enable.status).toBe(429)
      expect(enable.body.errors.password).toMatch(PAUSED)
      await AdminUser.updateOne({ email: TEST_ADMIN.email }, { accountCodeHash: createHash('sha256').update('654321').digest('hex'), accountCodeExpiresAt: new Date(Date.now() + 60_000) })
      const enableEmail = await agent.post(`${ACCOUNT}/enable`).set('Origin', ORIGIN).send({ method: 'email', password: TEST_ADMIN.password, code: '654321' })
      expect(enableEmail.body.code).toBe('PASSWORD_PAUSED')
      expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.accountCodeHash).not.toBeNull()

      const codes = ['aaaaa-bbbbb']
      await AdminUser.updateOne({ email: TEST_ADMIN.email }, { twoFactorMethod: 'email', recoveryCodeHashes: codes.map((code) => createHash('sha256').update(code.replace('-', '')).digest('hex')) })
      const disable = await agent.post(`${ACCOUNT}/disable`).set('Origin', ORIGIN).send({ password: TEST_ADMIN.password, recoveryCode: codes[0] })
      expect(disable.status).toBe(429)
      expect(disable.body.code).toBe('PASSWORD_PAUSED')
      expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.recoveryCodeHashes).toHaveLength(1)
    })

    it('gives the try back for the right password', async () => {
      await guess(WRONG_PASSWORDS_PER_HOUR - 1)
      for (let i = 0; i < 3; i++) expect((await confirm(TEST_ADMIN.password)).status).toBe(200)
      expect((await logIn(mailing, RIGHT)).status).toBe(200)
    })

    it('answers the wrong password that uses the last try with the pause, emails once, and logs it', async () => {
      await guess(WRONG_PASSWORDS_PER_HOUR - 1)
      const last = await confirm(WRONG.password)
      expect(last.status).toBe(429)
      expect(last.body.code).toBe('PASSWORD_PAUSED')
      await confirm(TEST_ADMIN.password)
      await settle()
      expect(pausedEmails()).toHaveLength(1)
      expect(pausedEmails()[0].text).toContain('changes in the admin panel that need your password')
      const reasons = (await SecurityEvent.find({ action: 'password.confirm' }).sort({ _id: 1 }).lean()).map((event) => event.reason)
      expect(reasons).toEqual(['PASSWORD_PAUSED_NOW', 'PASSWORD_PAUSED'])
    })
  })

  it('works for accounts stored before this limit existed (2026-10-30)', async () => {
    await AdminUser.collection.updateOne({ email: TEST_ADMIN.email }, { $unset: { wrongPasswordWindowStart: '', wrongPasswordsInWindow: '' } })
    expect((await logIn(mailing, RIGHT)).status).toBe(200)
    await guess(WRONG_PASSWORDS_PER_HOUR)
    expect((await logIn(mailing, RIGHT)).status).toBe(401)
  })
})

describe('admin session', () => {
  it('reports who is logged in, and 401 without a session', async () => {
    await createTestAdmin()
    expect((await request(app).get('/api/admin/session')).status).toBe(401)
    const agent = await loggedInAgent(app)
    const res = await agent.get('/api/admin/session')
    expect(res.status).toBe(200)
    expect(res.body.admin).toEqual({ name: TEST_ADMIN.name, email: TEST_ADMIN.email })
  })

  it('reports no currency when none is configured', async () => {
    await createTestAdmin()
    const noCurrency = testApp({ currency: null })
    const agent = await loggedInAgent(noCurrency)
    expect((await agent.get('/api/admin/session')).body.currency).toBeNull()
  })

  it('logs out: the session is deleted and the cookie no longer works', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    const res = await agent.delete('/api/admin/session').set('Origin', ORIGIN)
    expect(res.status).toBe(204)
    expect(String(res.headers['set-cookie'])).toMatch(/gpec_admin_session=;.*Expires=Thu, 01 Jan 1970/)
    expect(await AdminSession.countDocuments()).toBe(0)
    expect((await agent.get('/api/admin/session')).status).toBe(401)
  })

  it('rejects an expired session', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    await AdminSession.updateMany({}, { expiresAt: new Date(Date.now() - 1000) })
    expect((await agent.get('/api/admin/session')).status).toBe(401)
  })

  it('ends existing sessions when the account is deactivated', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { isActive: false })
    expect((await agent.get('/api/admin/session')).status).toBe(401)
  })

  it('ignores a made-up session token', async () => {
    const res = await request(app).get('/api/admin/session').set('Cookie', 'gpec_admin_session=made-up-token')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('ADMIN_AUTH_REQUIRED')
  })
})

describe('changing your own password', () => {
  const NEW_PASSWORD = 'a brand new long passphrase'

  function changePassword(agent: Awaited<ReturnType<typeof loggedInAgent>>, body: object) {
    return agent.post('/api/admin/session/password').set('Origin', ORIGIN).send(body)
  }

  it('requires a logged-in admin', async () => {
    const res = await request(app).post('/api/admin/session/password').send({ currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(401)
  })

  it('changes the password: the new one works, the old one does not', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    expect((await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })).status).toBe(204)
    expect((await logIn(app, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })).status).toBe(401)
    expect((await logIn(app, { email: TEST_ADMIN.email, password: NEW_PASSWORD })).status).toBe(200)
    expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.passwordChangedAt).toBeInstanceOf(Date)
  })

  it('keeps this session logged in and ends every other session', async () => {
    await createTestAdmin()
    const thisBrowser = await loggedInAgent(app)
    const otherBrowser = await loggedInAgent(app)
    await changePassword(thisBrowser, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })
    expect((await thisBrowser.get('/api/admin/session')).status).toBe(200)
    expect((await otherBrowser.get('/api/admin/session')).status).toBe(401)
  })

  it('gives this browser a new session token, so a copied cookie stops working', async () => {
    await createTestAdmin()
    const login = await logIn(app, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    const oldCookie = String(login.headers['set-cookie']).split(';')[0]
    const res = await request(app).post('/api/admin/session/password').set('Origin', ORIGIN).set('Cookie', oldCookie)
      .send({ currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(204)
    const newCookie = String(res.headers['set-cookie']).split(';')[0]
    expect(newCookie).toMatch(/^gpec_admin_session=[\w-]{43}$/)
    expect(newCookie).not.toBe(oldCookie)
    expect((await request(app).get('/api/admin/session').set('Cookie', oldCookie)).status).toBe(401)
    expect((await request(app).get('/api/admin/session').set('Cookie', newCookie)).status).toBe(200)
    expect(await AdminSession.countDocuments()).toBe(1)
  })

  it('works for an account and session stored before password versions existed (2026-10-26)', async () => {
    await createTestAdmin()
    const thisBrowser = await loggedInAgent(app)
    const otherBrowser = await loggedInAgent(app)
    await AdminUser.collection.updateMany({}, { $unset: { credentialVersion: '' } })
    await AdminSession.collection.updateMany({}, { $unset: { credentialVersion: '' } })
    expect((await thisBrowser.get('/api/admin/session')).status).toBe(200)
    expect((await changePassword(thisBrowser, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })).status).toBe(204)
    expect((await thisBrowser.get('/api/admin/session')).status).toBe(200)
    expect((await otherBrowser.get('/api/admin/session')).status).toBe(401)
    expect((await AdminUser.findOne().lean())?.credentialVersion).toBe(1)
  })

  it('refuses a wrong current password with 400 (the session stays valid)', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    const res = await changePassword(agent, { currentPassword: 'not my password', newPassword: NEW_PASSWORD })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'WRONG_PASSWORD', errors: { currentPassword: 'Your current password is incorrect.' } })
    expect((await logIn(app, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })).status).toBe(200)
    expect((await agent.get('/api/admin/session')).status).toBe(200)
  })

  it.each([
    ['too short', 'short password', 'Use at least 15 characters'],
    ['the same as the current one', TEST_ADMIN.password, 'different from your current one'],
    ['not text', { $ne: '' }, 'Use at least 15 characters'],
  ])('refuses a new password that is %s', async (_label, newPassword, message) => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    const res = await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword })
    expect(res.status).toBe(400)
    expect(res.body.errors.newPassword).toContain(message)
  })

  it('limits wrong current passwords, but not other mistakes', async () => {
    await createTestAdmin()
    const limited = testApp({ adminLoginRateLimit: { windowMs: 60_000, limit: 2 } })
    const agent = await loggedInAgent(limited)
    for (let attempt = 0; attempt < 3; attempt++) {
      expect((await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: 'too short' })).status).toBe(400)
    }
    expect((await changePassword(agent, { currentPassword: 'wrong 1', newPassword: NEW_PASSWORD })).body.code).toBe('WRONG_PASSWORD')
    expect((await changePassword(agent, { currentPassword: 'wrong 2', newPassword: NEW_PASSWORD })).body.code).toBe('WRONG_PASSWORD')
    const blocked = await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })
    expect(blocked.status).toBe(429)
  })

  it('refuses a password known from a data breach, checking only the new password', async () => {
    await createTestAdmin()
    const checked: string[] = []
    const breachedApp = testApp({}, null, { isBreached: async (password) => { checked.push(password); return true } })
    const agent = await loggedInAgent(breachedApp)
    const res = await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ code: 'PASSWORD_BREACHED', errors: { newPassword: expect.stringContaining('appeared in a data breach') } })
    expect(checked).toEqual([NEW_PASSWORD])
    expect((await logIn(app, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })).status).toBe(200)
  })

  // As for reset links (audit S2-M03): a session alone, such as a copied cookie, asked the breached-
  // password service about any password as often as it liked, without the wrong-password limit counting.
  it('checks the current password before asking the breached-password service', async () => {
    await createTestAdmin()
    const checked: string[] = []
    const agent = await loggedInAgent(testApp({}, null, { isBreached: async (password) => { checked.push(password); return true } }))
    const res = await changePassword(agent, { currentPassword: 'not my password', newPassword: NEW_PASSWORD })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('WRONG_PASSWORD')
    expect(checked).toEqual([])
  })

  // Audit L-03: passwords are stored "tidied" (Unicode NFKC: wide look-alike letters become ordinary
  // ones), so every rule must look at the tidied password, the one that is actually stored.
  describe('checks the password as it is stored, with look-alike letters made ordinary', () => {
    // The same text in full-width letters, as some keyboards type it.
    const wide = (plain: string) => [...plain].map((char) => char === ' ' ? '　' : String.fromCharCode(char.charCodeAt(0) + 0xfee0)).join('')
    const BREACHED = 'passwordpassword'

    it('refuses the look-alike version of a breached password', async () => {
      await createTestAdmin()
      const checked: string[] = []
      const agent = await loggedInAgent(testApp({}, null, { isBreached: async (password) => { checked.push(password); return password === BREACHED } }))
      const res = await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: wide(BREACHED) })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('PASSWORD_BREACHED')
      expect(checked).toEqual([BREACHED])
    })

    it('refuses a password that reaches 15 characters only before it is tidied', async () => {
      await createTestAdmin()
      const agent = await loggedInAgent(app)
      // "e" plus a combining accent, eight times: 16 characters typed, 8 once tidied ("é").
      const res = await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: 'é'.repeat(8) })
      expect(res.status).toBe(400)
      expect(res.body.errors.newPassword).toContain('Use at least 15 characters')
    })

    it('refuses the look-alike version of the current password as the same password', async () => {
      await createTestAdmin()
      const agent = await loggedInAgent(app)
      const res = await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: wide(TEST_ADMIN.password) })
      expect(res.status).toBe(400)
      expect(res.body.errors.newPassword).toContain('different from your current one')
    })

    it('refuses the current password again when the current one is typed in look-alike letters', async () => {
      await createTestAdmin()
      const agent = await loggedInAgent(app)
      const res = await changePassword(agent, { currentPassword: wide(TEST_ADMIN.password), newPassword: TEST_ADMIN.password })
      expect(res.status).toBe(400)
      expect(res.body.errors.newPassword).toContain('different from your current one')
    })

    it('logs in with a look-alike password typed either way, as before', async () => {
      await createTestAdmin()
      const agent = await loggedInAgent(app)
      expect((await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: wide(NEW_PASSWORD) })).status).toBe(204)
      expect((await logIn(app, { email: TEST_ADMIN.email, password: NEW_PASSWORD })).status).toBe(200)
      expect((await logIn(app, { email: TEST_ADMIN.email, password: wide(NEW_PASSWORD) })).status).toBe(200)
    })

    it('applies to a password set from a reset link too', async () => {
      await createTestAdmin()
      const reset = await createPasswordReset(TEST_ADMIN.email)
      const breachedApp = testApp({}, null, { isBreached: async (password) => password === BREACHED })
      const res = await request(breachedApp).post('/api/admin/session/password-reset/confirm').set('Origin', ORIGIN).send({ token: reset?.token, newPassword: wide(BREACHED) })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('PASSWORD_BREACHED')
    })
  })

  it('goes ahead, and logs it, when the breach check cannot be made', async () => {
    await createTestAdmin()
    const unreachableApp = testApp({}, null, { isBreached: async () => null })
    const agent = await loggedInAgent(unreachableApp)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })
    const warnings = warn.mock.calls.map((call) => String(call[0]))
    warn.mockRestore()
    expect(res.status).toBe(204)
    expect(warnings).toEqual([expect.stringContaining('breached-password check could not be made')])
    expect(warnings.join(' ')).not.toContain(NEW_PASSWORD)
  })

  it('does not check passwords that fail the other rules', async () => {
    await createTestAdmin()
    const checked: string[] = []
    const agent = await loggedInAgent(testApp({}, null, { isBreached: async (password) => { checked.push(password); return false } }))
    await changePassword(agent, { currentPassword: TEST_ADMIN.password, newPassword: 'too short' })
    expect(checked).toEqual([])
  })

  it('refuses a change sent from another site', async () => {
    await createTestAdmin()
    const agent = await loggedInAgent(app)
    const res = await agent.post('/api/admin/session/password').set('Origin', 'https://attacker.example').send({ currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD })
    expect(res.status).toBe(403)
  })
})
