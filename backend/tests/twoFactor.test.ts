import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import AdminLoginChallenge from '../src/models/AdminLoginChallenge.js'
import AdminSession from '../src/models/AdminSession.js'
import AdminUser from '../src/models/AdminUser.js'
import { createPasswordReset } from '../src/services/adminAuth.js'
import { open, seal } from '../src/services/secretBox.js'
import { MAX_CODE_ATTEMPTS } from '../src/services/twoFactor.js'
import { currentStep, matchTotp, toBase32, totpCode } from '../src/services/totp.js'
import { RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, TEST_TWO_FACTOR_KEY, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'

useTestDatabase()

const ORIGIN = 'http://localhost:5173'
const ACCOUNT = '/api/admin/account/two-factor'
const LOGIN = '/api/admin/session'
const NEW_PASSWORD = 'a brand new long passphrase'

let mailer: RecordingMailer
let app: ReturnType<typeof testApp>
let agent: TestAgent

beforeEach(async () => {
  mailer = new RecordingMailer()
  app = testApp({ email: TEST_EMAIL_SETTINGS }, mailer)
  await createTestAdmin()
  agent = await loggedInAgent(app)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
const post = (client: TestAgent, path: string, body: object = {}) => client.post(path).set('Origin', ORIGIN).send(body)
// The 6-digit code in the last email sent.
const lastEmailedCode = () => /\n(\d{6})\n/.exec(mailer.sent.at(-1)?.text ?? '')?.[1] ?? ''

async function appSecret() {
  const admin = await AdminUser.findOne({ email: TEST_ADMIN.email }).lean()
  const sealed = admin?.twoFactorSecret ?? admin?.pendingTwoFactorSecret
  return open(sealed ?? '', TEST_TWO_FACTOR_KEY) as Buffer
}

// Turns on the authenticator app for the logged-in admin and returns its recovery codes. The first
// code is the current step's, so later logins use the next step's (a code cannot be used twice).
async function turnOnApp() {
  await post(agent, `${ACCOUNT}/app`).expect(200)
  const res = await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code: totpCode(await appSecret(), currentStep()) })
  expect(res.status).toBe(200)
  return res.body.recoveryCodes as string[]
}

async function turnOnEmail() {
  await post(agent, `${ACCOUNT}/email-code`).expect(202)
  await settle()
  const res = await post(agent, `${ACCOUNT}/enable`, { method: 'email', password: TEST_ADMIN.password, code: lastEmailedCode() })
  expect(res.status).toBe(200)
  return res.body.recoveryCodes as string[]
}

// Password step of a login; the returned agent holds the challenge cookie.
async function startLogin() {
  const client = request.agent(app)
  const res = await post(client, LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
  return { client, res }
}

describe('one-time codes (RFC 6238) and the key format (RFC 4648)', () => {
  // RFC 6238 Appendix B, SHA-1 secret "12345678901234567890"; the last six of its eight digits.
  const secret = Buffer.from('12345678901234567890')
  it.each([[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']])('matches the published code at %i seconds', (seconds, code) => {
    expect(totpCode(secret, Math.floor(seconds / 30))).toBe(code)
  })

  it('writes keys in Base32 as authenticator apps expect', () => {
    expect(toBase32(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
    expect(toBase32(Buffer.from('f'))).toBe('MY')
  })

  it('accepts the code one step either side of now, no further, and never a step already used', () => {
    const now = 1_000_000_000_000
    const step = currentStep(now)
    for (const offset of [-1, 0, 1]) expect(matchTotp(secret, totpCode(secret, step + offset), null, now)).toBe(step + offset)
    for (const offset of [-2, 2]) expect(matchTotp(secret, totpCode(secret, step + offset), null, now)).toBeNull()
    expect(matchTotp(secret, totpCode(secret, step), step, now)).toBeNull()
    expect(matchTotp(secret, 'abcdef', null, now)).toBeNull()
  })
})

describe('encrypted secrets', () => {
  it('opens with the same key only, and refuses anything changed', () => {
    const sealed = seal(Buffer.from('a secret'), TEST_TWO_FACTOR_KEY)
    expect(open(sealed, TEST_TWO_FACTOR_KEY)?.toString()).toBe('a secret')
    expect(open(sealed, Buffer.alloc(32, 8))).toBeNull()
    const parts = sealed.split('.')
    parts[3] = Buffer.from('another secret').toString('base64url')
    expect(open(parts.join('.'), TEST_TWO_FACTOR_KEY)).toBeNull()
    expect(open('nonsense', TEST_TWO_FACTOR_KEY)).toBeNull()
  })

  it('takes TWO_FACTOR_ENCRYPTION_KEY only as 32 bytes of base64', () => {
    expect(loadConfig({ TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') }).twoFactorKey).toEqual(Buffer.alloc(32, 1))
    expect(loadConfig({}).twoFactorKey).toBeNull()
    expect(() => loadConfig({ TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64') })).toThrow(/TWO_FACTOR_ENCRYPTION_KEY must be 32 random bytes/)
    expect(() => loadConfig({ TWO_FACTOR_ENCRYPTION_KEY: 'not a key' })).toThrow(/TWO_FACTOR_ENCRYPTION_KEY/)
  })
})

describe('the banner suggesting two-step login', () => {
  it('shows until closed, stays closed for this login, and comes back at the next login', async () => {
    expect((await agent.get(LOGIN)).body.twoFactor).toEqual({ enabled: false, prompt: true })
    await post(agent, `${LOGIN}/two-factor-prompt/dismiss`).expect(204)
    expect((await agent.get(LOGIN)).body.twoFactor).toEqual({ enabled: false, prompt: false })
    const nextLogin = await loggedInAgent(app)
    expect((await nextLogin.get(LOGIN)).body.twoFactor).toEqual({ enabled: false, prompt: true })
  })

  it('is not shown once two-step login is on', async () => {
    await turnOnApp()
    expect((await agent.get(LOGIN)).body.twoFactor).toEqual({ enabled: true, prompt: false })
  })

  it('can be closed only by a logged-in admin', async () => {
    expect((await request(app).post(`${LOGIN}/two-factor-prompt/dismiss`).set('Origin', ORIGIN)).status).toBe(401)
  })
})

describe('setting up an authenticator app', () => {
  it('shows the key and QR link, turns on with a first code, gives ten recovery codes, and ends other sessions', async () => {
    const otherBrowser = await loggedInAgent(app)
    expect((await agent.get(ACCOUNT)).body).toEqual({ method: null, enabledAt: null, recoveryCodesLeft: 0, available: { app: true, email: true } })
    const setup = await post(agent, `${ACCOUNT}/app`)
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(setup.body.uri).toBe(`otpauth://totp/GPEC%20Admin%3A${encodeURIComponent(TEST_ADMIN.email)}?secret=${setup.body.secret}&issuer=GPEC+Admin&algorithm=SHA1&digits=6&period=30`)

    // A wrong code changes nothing.
    const wrong = await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code: '000000' === totpCode(await appSecret(), currentStep()) ? '111111' : '000000' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.code).toBe('WRONG_CODE')
    expect((await agent.get(ACCOUNT)).body.method).toBeNull()

    const res = await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code: totpCode(await appSecret(), currentStep()) })
    expect(res.status).toBe(200)
    expect(res.body.recoveryCodes).toHaveLength(10)
    expect(new Set(res.body.recoveryCodes).size).toBe(10)
    for (const code of res.body.recoveryCodes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/)
    expect(res.body).toMatchObject({ method: 'app', recoveryCodesLeft: 10 })

    // This browser stays logged in; others, logged in with the password alone, are logged out.
    expect((await agent.get(LOGIN)).status).toBe(200)
    expect((await otherBrowser.get(LOGIN)).status).toBe(401)
    await settle()
    expect(mailer.sent.at(-1)).toMatchObject({ to: [TEST_ADMIN.email], subject: 'Two-step login is on for your GPEC admin account' })
  })

  it('stores the secret encrypted and the recovery codes hashed', async () => {
    const codes = await turnOnApp()
    const stored = await AdminUser.findOne({ email: TEST_ADMIN.email }).lean()
    expect(stored?.twoFactorSecret).toMatch(/^v1\./)
    expect(stored?.twoFactorSecret).not.toContain(toBase32(await appSecret()))
    expect(stored?.recoveryCodeHashes).toHaveLength(10)
    expect(JSON.stringify(stored)).not.toContain(codes[0])
  })

  it('is unavailable without the encryption key, and refused once it is already on', async () => {
    const noKey = testApp({ email: TEST_EMAIL_SETTINGS, twoFactorKey: null }, mailer)
    const noKeyAgent = await loggedInAgent(noKey)
    expect((await noKeyAgent.get(ACCOUNT)).body.available).toEqual({ app: false, email: true })
    expect((await post(noKeyAgent, `${ACCOUNT}/app`)).body.code).toBe('APP_CODES_UNAVAILABLE')
    await turnOnApp()
    expect((await post(agent, `${ACCOUNT}/app`)).body.code).toBe('TWO_FACTOR_ALREADY_ON')
  })

  it('is cancelled by a password change, like an emailed setup code', async () => {
    await post(agent, `${ACCOUNT}/app`).expect(200)
    const appCode = totpCode(await appSecret(), currentStep())
    await post(agent, `${ACCOUNT}/email-code`).expect(202)
    await settle()
    const emailedCode = lastEmailedCode()
    await post(agent, `${LOGIN}/password`, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD }).expect(204)
    expect((await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: NEW_PASSWORD, code: appCode })).body.code).toBe('SETUP_NOT_STARTED')
    expect((await post(agent, `${ACCOUNT}/enable`, { method: 'email', password: NEW_PASSWORD, code: emailedCode })).body.code).toBe('SETUP_NOT_STARTED')
  })

  it('needs a setup started first', async () => {
    expect((await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code: '123456' })).body.code).toBe('SETUP_NOT_STARTED')
  })
})

// A session alone (a browser left logged in, a copied cookie) must not be enough to put someone
// else's phone on the account and lock its owner out.
// Audit S2-M01: turning two-step login on ends everything logged in with the password alone, including
// a login whose password was checked just before, and a copy of this browser's own cookie.
describe('turning it on ends every session from before', () => {
  const ORDERS = '/api/admin/orders'

  it('refuses a login whose password step ran while two-step login was being turned on', async () => {
    await post(agent, `${ACCOUNT}/app`).expect(200)
    // The other login stops just before its session is saved, after its password and two-step checks.
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const save = AdminSession.create.bind(AdminSession)
    const create = vi.spyOn(AdminSession, 'create').mockImplementationOnce((async (...args: Parameters<typeof save>) => {
      await gate
      return save(...args)
    }) as typeof save)
    const attacker = request.agent(app)
    const login = post(attacker, LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password }).then((res) => res)
    await vi.waitFor(() => expect(create).toHaveBeenCalled())

    await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code: totpCode(await appSecret(), currentStep()) }).expect(200)
    release()
    expect((await login).status).toBe(200)
    expect((await attacker.get(ORDERS)).status).toBe(401)
    expect((await agent.get(ORDERS)).status).toBe(200)
  })

  it.each(['app', 'email'] as const)('gives this browser a new cookie, so a copy of the old one stops working (%s)', async (method) => {
    const old = (await post(request.agent(app), LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200)).headers['set-cookie']
    const browser = (path: string, body: object = {}) => request(app).post(path).set('Origin', ORIGIN).set('Cookie', old).send(body)
    let code: string
    if (method === 'app') {
      await browser(`${ACCOUNT}/app`).expect(200)
      code = totpCode(await appSecret(), currentStep())
    } else {
      await browser(`${ACCOUNT}/email-code`).expect(202)
      await settle()
      code = lastEmailedCode()
    }
    const enabled = await browser(`${ACCOUNT}/enable`, { method, password: TEST_ADMIN.password, code }).expect(200)
    const fresh = enabled.headers['set-cookie']
    expect(String(fresh)).toMatch(/^gpec_admin_session=[^;]+; Max-Age=28800; Path=\/api\/admin; Expires=[^;]+; HttpOnly; SameSite=Strict$/)
    expect(String(fresh).split(';')[0]).not.toBe(String(old).split(';')[0])
    expect((await request(app).get(ORDERS).set('Cookie', old)).status).toBe(401)
    expect((await request(app).get(ORDERS).set('Cookie', fresh)).status).toBe(200)
    // Still the one session, not one more.
    expect(await AdminSession.countDocuments()).toBe(1)
  })

  it('changes nothing when it is refused', async () => {
    await post(agent, `${ACCOUNT}/app`).expect(200)
    const before = (await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.credentialVersion ?? 0
    const refused = await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code: '000000' === totpCode(await appSecret(), currentStep()) ? '111111' : '000000' })
    expect(refused.status).toBe(400)
    expect(refused.headers['set-cookie']).toBeUndefined()
    expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.credentialVersion ?? 0).toBe(before)
    expect((await agent.get(ORDERS)).status).toBe(200)
  })
})

describe('turning it on needs the current password', () => {
  it('refuses a missing or wrong password with an app code, and leaves the setup usable', async () => {
    await post(agent, `${ACCOUNT}/app`).expect(200)
    const code = totpCode(await appSecret(), currentStep())
    const missing = await post(agent, `${ACCOUNT}/enable`, { method: 'app', code })
    expect(missing.status).toBe(400)
    expect(missing.body.errors).toEqual({ password: 'Enter your password.' })
    const wrong = await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: 'not my password at all', code })
    expect(wrong.status).toBe(400)
    expect(wrong.body).toMatchObject({ code: 'WRONG_PASSWORD', errors: { password: 'Your password is incorrect.' } })
    expect((await agent.get(ACCOUNT)).body.method).toBeNull()
    expect(mailer.sent).toHaveLength(0)
    expect((await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code })).status).toBe(200)
  })

  it('refuses a wrong password with an emailed code without using up the code', async () => {
    await post(agent, `${ACCOUNT}/email-code`).expect(202)
    await settle()
    const code = lastEmailedCode()
    for (let attempt = 0; attempt < 6; attempt++) {
      expect((await post(agent, `${ACCOUNT}/enable`, { method: 'email', password: 'not my password at all', code })).body.code).toBe('WRONG_PASSWORD')
    }
    expect((await agent.get(ACCOUNT)).body.method).toBeNull()
    expect((await post(agent, `${ACCOUNT}/enable`, { method: 'email', password: TEST_ADMIN.password, code })).status).toBe(200)
  })

  it('counts wrong passwords toward the limit', async () => {
    const limited = testApp({ email: TEST_EMAIL_SETTINGS, adminLoginRateLimit: { windowMs: 60_000, limit: 2 } }, mailer)
    const limitedAgent = await loggedInAgent(limited)
    await post(limitedAgent, `${ACCOUNT}/app`).expect(200)
    const code = totpCode(await appSecret(), currentStep())
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await post(limitedAgent, `${ACCOUNT}/enable`, { method: 'app', password: 'not my password at all', code })).body.code).toBe('WRONG_PASSWORD')
    }
    expect((await post(limitedAgent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code })).status).toBe(429)
  })
})

describe('logging in with an authenticator app', () => {
  it('asks for the code after the password, and logs in only once it is right', async () => {
    const codes = await turnOnApp()
    expect(codes).toHaveLength(10)
    const { client, res } = await startLogin()
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ twoFactorRequired: true, method: 'app', emailHint: null, emailAvailable: true, emailCodeSent: false })
    // Not logged in yet: only the challenge cookie, for the login routes alone.
    expect(String(res.headers['set-cookie'])).toMatch(/gpec_admin_login=[\w-]{43}; Max-Age=600; Path=\/api\/admin\/session; .*HttpOnly; SameSite=Strict/)
    expect(String(res.headers['set-cookie'])).not.toContain('gpec_admin_session')
    expect((await client.get(LOGIN)).status).toBe(401)

    const wrong = await post(client, `${LOGIN}/two-factor`, { code: '000000' === totpCode(await appSecret(), currentStep() + 1) ? '111111' : '000000' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.message).toMatch(/4 tries left/)

    const right = await post(client, `${LOGIN}/two-factor`, { code: totpCode(await appSecret(), currentStep() + 1) })
    expect(right.status).toBe(200)
    expect(right.body).toMatchObject({ admin: { email: TEST_ADMIN.email }, twoFactor: { enabled: true, prompt: false } })
    expect((await client.get(LOGIN)).status).toBe(200)
    // The challenge is used up.
    expect(await AdminLoginChallenge.countDocuments()).toBe(0)
  })

  it('never accepts the same code twice', async () => {
    await turnOnApp()
    const code = totpCode(await appSecret(), currentStep() + 1)
    const first = await startLogin()
    expect((await post(first.client, `${LOGIN}/two-factor`, { code })).status).toBe(200)
    const second = await startLogin()
    expect((await post(second.client, `${LOGIN}/two-factor`, { code })).status).toBe(400)
  })

  it('lets one code complete only one of two logins sent at the same moment', async () => {
    await turnOnApp()
    const code = totpCode(await appSecret(), currentStep() + 1)
    const first = await startLogin()
    // A new login cancels earlier ones, but two started at the same instant can both stay open.
    const secondToken = 'B'.repeat(43)
    const admin = await AdminUser.findOne({ email: TEST_ADMIN.email }).lean()
    await AdminLoginChallenge.create({ tokenHash: createHash('sha256').update(secondToken).digest('hex'), admin: admin?._id, credentialVersion: admin?.credentialVersion, expiresAt: new Date(Date.now() + 60_000) })
    const statuses = await Promise.all([
      post(first.client, `${LOGIN}/two-factor`, { code }),
      request(app).post(`${LOGIN}/two-factor`).set('Origin', ORIGIN).set('Cookie', `gpec_admin_login=${secondToken}`).send({ code }),
    ].map((pending) => pending.then((res) => res.status)))
    expect(statuses.sort()).toEqual([200, 400])
  })

  it('allows five wrong codes for one login, then the password must be entered again', async () => {
    await turnOnApp()
    const wrongCode = '000000' === totpCode(await appSecret(), currentStep() + 1) ? '111111' : '000000'
    const { client } = await startLogin()
    for (let attempt = 1; attempt <= 4; attempt++) expect((await post(client, `${LOGIN}/two-factor`, { code: wrongCode })).status).toBe(400)
    const fifth = await post(client, `${LOGIN}/two-factor`, { code: wrongCode })
    expect(fifth.status).toBe(401)
    expect(fifth.body.code).toBe('LOGIN_EXPIRED')
    expect((await post(client, `${LOGIN}/two-factor`, { code: totpCode(await appSecret(), currentStep() + 1) })).status).toBe(401)
  })

  it('refuses a login that has timed out, a missing cookie, and an admin deactivated meanwhile', async () => {
    await turnOnApp()
    const code = totpCode(await appSecret(), currentStep() + 1)
    const timedOut = await startLogin()
    await AdminLoginChallenge.updateMany({}, { expiresAt: new Date(Date.now() - 1000) })
    expect((await post(timedOut.client, `${LOGIN}/two-factor`, { code })).body.code).toBe('LOGIN_EXPIRED')
    expect((await post(request.agent(app), `${LOGIN}/two-factor`, { code })).body.code).toBe('LOGIN_EXPIRED')
    const deactivated = await startLogin()
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { isActive: false })
    expect((await post(deactivated.client, `${LOGIN}/two-factor`, { code })).body.code).toBe('LOGIN_EXPIRED')
  })

  it('logs in with a recovery code once, emailing how many are left', async () => {
    const [first] = await turnOnApp()
    const one = await startLogin()
    const res = await post(one.client, `${LOGIN}/two-factor`, { recoveryCode: first.toUpperCase().replace('-', ' ') })
    expect(res.status).toBe(200)
    await settle()
    expect(mailer.sent.at(-1)).toMatchObject({ subject: 'A recovery code was used for your GPEC admin account' })
    expect(mailer.sent.at(-1)?.text).toContain('you have 9 left')
    const again = await startLogin()
    expect((await post(again.client, `${LOGIN}/two-factor`, { recoveryCode: first })).status).toBe(400)
  })

  it('cancels a login waiting for its code when the password is reset; the recovery code tried stays unused', async () => {
    const [first] = await turnOnApp()
    const waiting = await startLogin()
    const reset = await createPasswordReset(TEST_ADMIN.email)
    await post(request.agent(app), `${LOGIN}/password-reset/confirm`, { token: reset?.token, newPassword: NEW_PASSWORD }).expect(204)
    expect((await post(waiting.client, `${LOGIN}/two-factor`, { recoveryCode: first })).body.code).toBe('LOGIN_EXPIRED')
    const client = request.agent(app)
    await post(client, LOGIN, { email: TEST_ADMIN.email, password: NEW_PASSWORD }).expect(200)
    expect((await post(client, `${LOGIN}/two-factor`, { recoveryCode: first })).status).toBe(200)
  })

  it('refuses a login whose password step ran while the password was being changed', async () => {
    const [first] = await turnOnApp()
    const waiting = await startLogin()
    // As if the change finished just after this login's challenge was stored.
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { $inc: { credentialVersion: 1 } })
    expect((await post(waiting.client, `${LOGIN}/two-factor`, { recoveryCode: first })).body.code).toBe('LOGIN_EXPIRED')
  })

  it('cancels a login waiting for its code when the password is changed', async () => {
    const [first] = await turnOnApp()
    const waiting = await startLogin()
    await post(agent, `${LOGIN}/password`, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD }).expect(204)
    expect((await post(waiting.client, `${LOGIN}/two-factor`, { recoveryCode: first })).body.code).toBe('LOGIN_EXPIRED')
  })

  it('without the encryption key, says app codes cannot be checked; a recovery code still works', async () => {
    const [first] = await turnOnApp()
    app = testApp({ email: TEST_EMAIL_SETTINGS, twoFactorKey: null }, mailer)
    const { client } = await startLogin()
    const res = await post(client, `${LOGIN}/two-factor`, { code: '123456' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('APP_CODES_UNAVAILABLE')
    expect((await post(client, `${LOGIN}/two-factor`, { recoveryCode: first })).status).toBe(200)
  })
})

describe('email codes', () => {
  it('are set up with an emailed code, then emailed at each login', async () => {
    await turnOnEmail()
    expect((await agent.get(ACCOUNT)).body.method).toBe('email')
    const { client, res } = await startLogin()
    expect(res.body).toEqual({ twoFactorRequired: true, method: 'email', emailHint: 'a•••@example.test', emailAvailable: true, emailCodeSent: true })
    await settle()
    expect(mailer.sent.at(-1)).toMatchObject({ to: [TEST_ADMIN.email], subject: 'Your GPEC admin login code' })
    expect((await post(client, `${LOGIN}/two-factor`, { code: lastEmailedCode() })).status).toBe(200)
  })

  it('can be sent again after a minute, and only a few times for one login', async () => {
    await turnOnEmail()
    const { client } = await startLogin()
    expect((await post(client, `${LOGIN}/two-factor/email-code`)).body.code).toBe('CODE_TOO_SOON')
    await AdminLoginChallenge.updateMany({}, { emailCodeSentAt: new Date(Date.now() - 61_000) })
    expect((await post(client, `${LOGIN}/two-factor/email-code`)).status).toBe(202)
    await settle()
    // Only the newest code works.
    expect((await post(client, `${LOGIN}/two-factor`, { code: lastEmailedCode() })).status).toBe(200)
    const another = await startLogin()
    await AdminLoginChallenge.updateMany({}, { emailCodesSent: 5, emailCodeSentAt: new Date(Date.now() - 61_000) })
    expect((await post(another.client, `${LOGIN}/two-factor/email-code`)).body.code).toBe('CODE_LIMIT')
  })

  it('do not work once expired', async () => {
    await turnOnEmail()
    const { client } = await startLogin()
    await settle()
    const code = lastEmailedCode()
    await AdminLoginChallenge.updateMany({}, { emailCodeSentAt: new Date(Date.now() - 11 * 60_000) })
    expect((await post(client, `${LOGIN}/two-factor`, { code })).status).toBe(400)
  })

  it('cannot be chosen while email is off; an admin using them is told to use a recovery code', async () => {
    const [first] = await turnOnEmail()
    app = testApp({}, null)
    const { client, res } = await startLogin()
    expect(res.body.emailAvailable).toBe(false)
    expect((await post(client, `${LOGIN}/two-factor/email-code`)).body.code).toBe('EMAIL_UNAVAILABLE')
    expect((await post(client, `${LOGIN}/two-factor`, { recoveryCode: first })).status).toBe(200)
    await createTestAdmin({ email: 'second@example.test', name: 'Second Admin' })
    const offAgent = await loggedInAgent(testApp({}, null), 'second@example.test')
    expect((await offAgent.get(ACCOUNT)).body.available.email).toBe(false)
  })
})

describe('turning it off and new recovery codes', () => {
  it('needs the password and a current code; then logging in needs only the password', async () => {
    const [first] = await turnOnApp()
    const wrongPassword = await post(agent, `${ACCOUNT}/disable`, { password: 'not the password at all', recoveryCode: first })
    expect(wrongPassword.body.code).toBe('WRONG_PASSWORD')
    const wrongCode = await post(agent, `${ACCOUNT}/disable`, { password: TEST_ADMIN.password, recoveryCode: 'aaaaa-aaaaa' })
    expect(wrongCode.body.code).toBe('WRONG_CODE')
    const res = await post(agent, `${ACCOUNT}/disable`, { password: TEST_ADMIN.password, code: totpCode(await appSecret(), currentStep() + 1) })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ method: null, recoveryCodesLeft: 0 })
    await settle()
    expect(mailer.sent.at(-1)).toMatchObject({ subject: 'Two-step login was turned off for your GPEC admin account' })
    const { res: login } = await startLogin()
    expect(login.body.admin.email).toBe(TEST_ADMIN.email)
    expect((await post(agent, `${ACCOUNT}/disable`, { password: TEST_ADMIN.password, recoveryCode: first })).body.code).toBe('TWO_FACTOR_OFF')
  })

  it('with email codes, uses a code emailed for the purpose', async () => {
    await turnOnEmail()
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { accountCodeSentAt: new Date(Date.now() - 61_000) })
    await post(agent, `${ACCOUNT}/email-code`).expect(202)
    await settle()
    expect(mailer.sent.at(-1)?.subject).toBe('Your GPEC admin security code')
    expect((await post(agent, `${ACCOUNT}/disable`, { password: TEST_ADMIN.password, code: lastEmailedCode() })).status).toBe(200)
  })

  it('makes ten new recovery codes; the old ones stop working', async () => {
    const [oldCode, secondOld] = await turnOnApp()
    const res = await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, recoveryCode: oldCode })
    expect(res.status).toBe(200)
    expect(res.body.recoveryCodes).toHaveLength(10)
    expect(res.body.recoveryCodes).not.toContain(secondOld)
    const { client } = await startLogin()
    expect((await post(client, `${LOGIN}/two-factor`, { recoveryCode: secondOld })).status).toBe(400)
    expect((await post(client, `${LOGIN}/two-factor`, { recoveryCode: res.body.recoveryCodes[0] })).status).toBe(200)
  })
})

// Audit S4-M01: two requests sent at once with the same emailed account code could both be approved,
// because the code was compared first and cleared afterwards.
describe('an emailed account code approves one change', () => {
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
  const clears = (update: Record<string, unknown>) => 'accountCodeHash' in update && update.accountCodeHash === null

  // Emails an account code to an admin using email codes and returns it.
  async function emailAccountCode() {
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { accountCodeSentAt: new Date(Date.now() - 61_000) })
    await post(agent, `${ACCOUNT}/email-code`).expect(202)
    await settle()
    return lastEmailedCode()
  }

  // Holds the first two AdminUser.updateOne calls that clear the account code until both have arrived,
  // so two requests have each checked the code before either clears it.
  function holdTwoClears() {
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const original = AdminUser.updateOne.bind(AdminUser)
    let held = 0
    vi.spyOn(AdminUser, 'updateOne').mockImplementation(((filter: Parameters<typeof original>[0], update: Record<string, unknown>) => {
      if (held >= 2 || !clears(update)) return original(filter, update)
      held += 1
      if (held === 2) release()
      return gate.then(() => original(filter, update))
    }) as unknown as typeof original)
  }

  it('two requests for new recovery codes at once: only one gets codes', async () => {
    await turnOnEmail()
    const code = await emailAccountCode()
    holdTwoClears()
    const results = await Promise.all([1, 2].map(() => post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code })))
    expect(results.map((res) => res.status).sort()).toEqual([200, 400])
    const winner = results.find((res) => res.status === 200)
    expect(results.find((res) => res.status === 400)?.body.code).toBe('WRONG_CODE')
    // The codes handed out are the ones that work.
    const { client } = await startLogin()
    expect((await post(client, `${LOGIN}/two-factor`, { recoveryCode: winner?.body.recoveryCodes[0] })).status).toBe(200)
  })

  it('new recovery codes and turning two-step login off at once: only one happens', async () => {
    await turnOnEmail()
    const code = await emailAccountCode()
    holdTwoClears()
    const [regenerate, disable] = await Promise.all([
      post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code }),
      post(agent, `${ACCOUNT}/disable`, { password: TEST_ADMIN.password, code }),
    ])
    expect([regenerate.status, disable.status].sort()).toEqual([200, 400])
    const stored = await AdminUser.findOne({ email: TEST_ADMIN.email }).lean()
    expect(stored?.twoFactorMethod).toBe(disable.status === 200 ? null : 'email')
  })

  it('a late request with a used-up code does not clear a newer code', async () => {
    await turnOnEmail()
    await emailAccountCode()
    const wrong = lastEmailedCode() === '000000' ? '111111' : '000000'
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { accountCodeAttempts: MAX_CODE_ATTEMPTS - 1 })
    // Holds the clearing of the code used up by its last wrong try (not the try itself).
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const original = AdminUser.updateOne.bind(AdminUser)
    let paused = false
    vi.spyOn(AdminUser, 'updateOne').mockImplementation(((filter: Record<string, unknown>, update: Record<string, unknown>) => {
      if (paused || !clears(update) || filter.accountCodeHash === sha256(wrong)) return original(filter, update)
      paused = true
      return gate.then(() => original(filter, update))
    }) as unknown as typeof original)
    const late = post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code: wrong }).then((res) => res)
    await vi.waitFor(() => expect(paused).toBe(true))
    const newer = await emailAccountCode()
    release()
    expect((await late).body.code).toBe('WRONG_CODE')
    expect((await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code: newer })).status).toBe(200)
  })

  // The minute between codes was checked on a copy read before saving, so requests at once each sent one.
  it('requests for a code sent at once email one code, and that code works', async () => {
    await turnOnEmail()
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { accountCodeSentAt: new Date(Date.now() - 61_000) })
    // Holds each request's write of a new code (a saved document or an update) until both have reached it.
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    let held = 0
    const hold = () => {
      held += 1
      if (held === 2) release()
      return gate
    }
    const save = AdminUser.prototype.save
    vi.spyOn(AdminUser.prototype, 'save').mockImplementation(async function (this: InstanceType<typeof AdminUser>, ...args: Parameters<typeof save>) {
      if (held < 2 && this.isModified('accountCodeHash')) await hold()
      return save.apply(this, args)
    })
    const findOneAndUpdate = AdminUser.findOneAndUpdate.bind(AdminUser)
    vi.spyOn(AdminUser, 'findOneAndUpdate').mockImplementation(((filter: Parameters<typeof findOneAndUpdate>[0], update: Record<string, unknown>, options: Parameters<typeof findOneAndUpdate>[2]) => {
      const query = findOneAndUpdate(filter, update, options)
      if (held >= 2 || typeof update?.accountCodeHash !== 'string') return query
      const wait = hold()
      const lean = query.lean.bind(query)
      return Object.assign(query, { lean: async () => { await wait; return lean() } })
    }) as unknown as typeof findOneAndUpdate)
    const before = mailer.sent.length
    const results = await Promise.all([1, 2].map(() => post(agent, `${ACCOUNT}/email-code`)))
    expect(results.map((res) => res.status).sort()).toEqual([202, 429])
    await settle()
    expect(mailer.sent.length - before).toBe(1)
    expect((await post(agent, `${ACCOUNT}/email-code`)).body.code).toBe('CODE_TOO_SOON')
    expect((await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code: lastEmailedCode() })).status).toBe(200)
  })

  it('is used up by five wrong tries, and works once', async () => {
    await turnOnEmail()
    const code = await emailAccountCode()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      expect((await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code: wrong })).body.code).toBe('WRONG_CODE')
    }
    expect((await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code })).body.code).toBe('WRONG_CODE')
    const fresh = await emailAccountCode()
    expect((await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code: fresh })).status).toBe(200)
    expect((await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, code: fresh })).body.code).toBe('WRONG_CODE')
  })
})

// Audit S3-M01: a change whose password (and code) was checked, but which was saved only after the owner
// reset the password, must save nothing and start no session.
describe('changes checked before the owner reset the password', () => {
  const OWNER_PASSWORD = 'the owner’s rescue passphrase'

  // Holds the first transaction (the change being saved) until released.
  function pauseTransaction() {
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const original = mongoose.connection.transaction.bind(mongoose.connection)
    const spy = vi.spyOn(mongoose.connection, 'transaction').mockImplementationOnce((async (...args: Parameters<typeof original>) => {
      await gate
      return original(...args)
    }) as typeof original)
    return { release, reached: () => expect(spy).toHaveBeenCalled() }
  }

  // Holds the first AdminUser.updateOne whose update matches, until released.
  function pauseUpdate(matches: (update: Record<string, unknown>) => boolean) {
    let release = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const original = AdminUser.updateOne.bind(AdminUser)
    let paused = false
    vi.spyOn(AdminUser, 'updateOne').mockImplementation(((filter: Parameters<typeof original>[0], update: Record<string, unknown>) => {
      if (paused || !matches(update)) return original(filter, update)
      paused = true
      return gate.then(() => original(filter, update))
    }) as unknown as typeof original)
    return { release, reached: () => expect(paused).toBe(true) }
  }

  async function ownerResets() {
    const reset = await createPasswordReset(TEST_ADMIN.email)
    await post(request.agent(app), `${LOGIN}/password-reset/confirm`, { token: reset?.token, newPassword: OWNER_PASSWORD }).expect(204)
  }

  async function logsIn(password: string) {
    return (await post(request.agent(app), LOGIN, { email: TEST_ADMIN.email, password })).status === 200
  }

  it('a password change saves nothing and starts no session', async () => {
    const paused = pauseTransaction()
    const change = post(agent, `${LOGIN}/password`, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD }).then((res) => res)
    await vi.waitFor(paused.reached)
    await ownerResets()
    paused.release()
    const res = await change
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACCOUNT_CHANGED')
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(await AdminSession.countDocuments()).toBe(0)
    expect(await logsIn(OWNER_PASSWORD)).toBe(true)
    expect(await logsIn(NEW_PASSWORD)).toBe(false)
  })

  it.each(['app', 'email'] as const)('turning two-step login on saves nothing and starts no session (%s)', async (method) => {
    let code: string
    if (method === 'app') {
      await post(agent, `${ACCOUNT}/app`).expect(200)
      code = totpCode(await appSecret(), currentStep())
    } else {
      await post(agent, `${ACCOUNT}/email-code`).expect(202)
      await settle()
      code = lastEmailedCode()
    }
    const paused = pauseTransaction()
    const enable = post(agent, `${ACCOUNT}/enable`, { method, password: TEST_ADMIN.password, code }).then((res) => res)
    await vi.waitFor(paused.reached)
    await ownerResets()
    paused.release()
    const res = await enable
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACCOUNT_CHANGED')
    expect(res.headers['set-cookie']).toBeUndefined()
    const stored = await AdminUser.findOne({ email: TEST_ADMIN.email }).lean()
    expect(stored).toMatchObject({ twoFactorMethod: null, twoFactorSecret: null, recoveryCodeHashes: [] })
    expect(await AdminSession.countDocuments()).toBe(0)
  })

  it('the app setup must still be the one checked, even if the account is otherwise unchanged', async () => {
    await post(agent, `${ACCOUNT}/app`).expect(200)
    const code = totpCode(await appSecret(), currentStep())
    const paused = pauseTransaction()
    const enable = post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code }).then((res) => res)
    await vi.waitFor(paused.reached)
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { pendingTwoFactorSecret: null, pendingTwoFactorExpiresAt: null })
    paused.release()
    expect((await enable).body.code).toBe('ACCOUNT_CHANGED')
    expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.twoFactorMethod).toBeNull()
  })

  it('turning two-step login off leaves it on', async () => {
    const [first] = await turnOnApp()
    const paused = pauseUpdate((update) => update.twoFactorMethod === null)
    const disable = post(agent, `${ACCOUNT}/disable`, { password: TEST_ADMIN.password, recoveryCode: first }).then((res) => res)
    await vi.waitFor(paused.reached)
    await ownerResets()
    paused.release()
    const res = await disable
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACCOUNT_CHANGED')
    expect((await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.twoFactorMethod).toBe('app')
  })

  it('new recovery codes are not made; the owner’s codes keep working', async () => {
    const [first, second] = await turnOnApp()
    const paused = pauseUpdate((update) => Array.isArray(update.recoveryCodeHashes))
    const regenerate = post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, recoveryCode: first }).then((res) => res)
    await vi.waitFor(paused.reached)
    await ownerResets()
    paused.release()
    const res = await regenerate
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ACCOUNT_CHANGED')
    expect(res.body.recoveryCodes).toBeUndefined()
    const login = request.agent(app)
    await post(login, LOGIN, { email: TEST_ADMIN.email, password: OWNER_PASSWORD }).expect(200)
    expect((await post(login, `${LOGIN}/two-factor`, { recoveryCode: second })).status).toBe(200)
  })

  it('still works for an account stored before password versions existed', async () => {
    const legacy = async () => {
      await AdminUser.collection.updateMany({}, { $unset: { credentialVersion: '' } })
      await AdminSession.collection.updateMany({}, { $unset: { credentialVersion: '' } })
    }
    await legacy()
    const [first] = await turnOnApp()
    await legacy()
    expect((await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, recoveryCode: first })).status).toBe(200)
    expect((await post(agent, `${ACCOUNT}/disable`, { password: TEST_ADMIN.password, code: totpCode(await appSecret(), currentStep() + 1) })).status).toBe(200)
  })
})

// Audit S3-L01: a password changed in the panel and new recovery codes emailed nobody, so an owner
// whose account was misused would not hear of it.
describe('emails for changes made in the admin panel', () => {
  it('tells the admin their password was changed in the panel, only once it was, and never says it', async () => {
    const wrong = await post(agent, `${LOGIN}/password`, { currentPassword: 'not the password at all', newPassword: NEW_PASSWORD })
    expect(wrong.body.code).toBe('WRONG_PASSWORD')
    await settle()
    expect(mailer.sent).toEqual([])
    await post(agent, `${LOGIN}/password`, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD }).expect(204)
    await settle()
    expect(mailer.sent).toHaveLength(1)
    const [email] = mailer.sent
    expect(email).toMatchObject({ to: [TEST_ADMIN.email], subject: 'Your GPEC admin password was changed' })
    expect(email.text).toContain('changed in the admin panel')
    expect(email.text).not.toContain('reset link,')
    expect(email.text).toContain(`${TEST_EMAIL_SETTINGS.siteUrl}/#admin/forgot-password`)
    expect(email.text).not.toContain(NEW_PASSWORD)
    expect(email.text).not.toContain(TEST_ADMIN.password)
  })

  it('keeps the reset-link wording for a reset', async () => {
    const reset = await createPasswordReset(TEST_ADMIN.email)
    await post(request.agent(app), `${LOGIN}/password-reset/confirm`, { token: reset?.token, newPassword: NEW_PASSWORD }).expect(204)
    await settle()
    expect(mailer.sent.at(-1)?.text).toContain('changed using a reset link')
  })

  it('tells the admin new recovery codes were made, only once they were, without the codes', async () => {
    const [first, second] = await turnOnApp()
    await settle()
    const before = mailer.sent.length
    expect((await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, recoveryCode: 'aaaaa-aaaaa' })).body.code).toBe('WRONG_CODE')
    await settle()
    expect(mailer.sent).toHaveLength(before)
    const res = await post(agent, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, recoveryCode: first }).expect(200)
    await settle()
    expect(mailer.sent).toHaveLength(before + 1)
    const email = mailer.sent.at(-1)
    expect(email).toMatchObject({ to: [TEST_ADMIN.email], subject: 'New recovery codes were made for your GPEC admin account' })
    expect(email?.text).toContain('The old ones no longer work.')
    for (const code of [first, second, ...res.body.recoveryCodes as string[]]) expect(email?.text).not.toContain(code)
  })
})

describe('admin accounts created before two-step login existed', () => {
  // Stored without any of the two-step login fields, as on databases from before it was added.
  async function makeLegacy() {
    await AdminUser.collection.updateOne({ email: TEST_ADMIN.email }, { $unset: { twoFactorMethod: '', twoFactorSecret: '', twoFactorEnabledAt: '', lastTotpStep: '', recoveryCodeHashes: '', pendingTwoFactorSecret: '', pendingTwoFactorExpiresAt: '', accountCodeHash: '', accountCodeExpiresAt: '', accountCodeAttempts: '', accountCodeSentAt: '' } })
    const stored = await AdminUser.collection.findOne({ email: TEST_ADMIN.email })
    expect(stored).not.toHaveProperty('recoveryCodeHashes')
  }

  it('show the status, log in, and can turn on an authenticator app', async () => {
    await makeLegacy()
    expect((await agent.get(ACCOUNT)).body).toMatchObject({ method: null, enabledAt: null, recoveryCodesLeft: 0 })
    expect((await agent.get(LOGIN)).body.twoFactor).toEqual({ enabled: false, prompt: true })
    expect((await startLogin()).res.body.admin.email).toBe(TEST_ADMIN.email)
    const codes = await turnOnApp()
    expect(codes).toHaveLength(10)
    const { client } = await startLogin()
    expect((await post(client, `${LOGIN}/two-factor`, { code: totpCode(await appSecret(), currentStep() + 1) })).status).toBe(200)
  })

  it('can turn on email codes', async () => {
    await makeLegacy()
    expect(await turnOnEmail()).toHaveLength(10)
  })

  it('finish a login started before password versions existed (2026-10-26)', async () => {
    const [first] = await turnOnApp()
    const { client } = await startLogin()
    await AdminUser.collection.updateOne({ email: TEST_ADMIN.email }, { $unset: { credentialVersion: '' } })
    await AdminLoginChallenge.collection.updateMany({}, { $unset: { credentialVersion: '' } })
    expect((await post(client, `${LOGIN}/two-factor`, { recoveryCode: first })).status).toBe(200)
    expect((await client.get(LOGIN)).status).toBe(200)
  })
})

// Someone who knows the password could otherwise start login after login: an email each time, and
// five fresh guesses at the code each time (audit finding M-03).
describe('limits per account, for someone who knows the password', () => {
  const loginEmails = () => mailer.sent.filter((email) => email.subject === 'Your GPEC admin login code')

  it('emails at most five login codes an hour, however many logins are started; the last code sent still works', async () => {
    await turnOnEmail()
    const logins = []
    for (let i = 0; i < 7; i++) logins.push(await startLogin())
    await settle()
    expect(loginEmails()).toHaveLength(5)
    expect(logins.map(({ res }) => res.body.emailCodeSent)).toEqual([true, true, true, true, true, false, false])
    const lastCode = /\n(\d{6})\n/.exec(loginEmails().at(-1)?.text ?? '')?.[1]
    expect((await post(logins[6].client, `${LOGIN}/two-factor`, { code: lastCode })).status).toBe(200)
  })

  it('counts codes sent again toward the same five', async () => {
    await turnOnEmail()
    for (let i = 0; i < 3; i++) await startLogin()
    const { client } = await startLogin()
    const resend = async () => {
      await AdminLoginChallenge.updateMany({}, { emailCodeSentAt: new Date(Date.now() - 2 * 60 * 1000) })
      return post(client, `${LOGIN}/two-factor/email-code`)
    }
    expect((await resend()).status).toBe(202)
    const refused = await resend()
    expect(refused.status).toBe(429)
    expect(refused.body.code).toBe('CODE_LIMIT')
    await settle()
    expect(loginEmails()).toHaveLength(5)
  })

  it('cancels a login waiting for its code when a new one starts', async () => {
    const [first] = await turnOnApp()
    const older = await startLogin()
    await startLogin()
    expect(await AdminLoginChallenge.countDocuments()).toBe(1)
    expect((await post(older.client, `${LOGIN}/two-factor`, { recoveryCode: first })).body.code).toBe('LOGIN_EXPIRED')
  })

  it('pauses 6-digit codes after ten wrong ones in an hour; a recovery code still works', async () => {
    const [first] = await turnOnApp()
    const secret = await appSecret()
    const wrong = ['000000', '111111'].find((code) => [-1, 0, 1, 2].every((offset) => totpCode(secret, currentStep() + offset) !== code))
    for (let login = 0; login < 2; login++) {
      const { client } = await startLogin()
      for (let attempt = 0; attempt < 5; attempt++) expect((await post(client, `${LOGIN}/two-factor`, { code: wrong })).status).toBe(attempt < 4 ? 400 : 401)
    }
    const paused = await startLogin()
    const res = await post(paused.client, `${LOGIN}/two-factor`, { code: totpCode(secret, currentStep() + 1) })
    expect(res.status).toBe(429)
    expect(res.body.code).toBe('CODES_PAUSED')
    expect((await post(paused.client, `${LOGIN}/two-factor`, { recoveryCode: first })).status).toBe(200)
  })

  it('works for accounts stored before these limits existed (2026-10-26)', async () => {
    await turnOnEmail()
    await AdminUser.collection.updateOne({ email: TEST_ADMIN.email }, { $unset: { loginEmailWindowStart: '', loginEmailsInWindow: '', wrongCodeWindowStart: '', wrongCodesInWindow: '' } })
    const { client, res } = await startLogin()
    expect(res.body.emailCodeSent).toBe(true)
    await settle()
    expect((await post(client, `${LOGIN}/two-factor`, { code: lastEmailedCode() })).status).toBe(200)
  })

  it('counts a password step that waits for its code as a failed login until the code is entered', async () => {
    const [first, second, third] = await turnOnApp()
    const limited = testApp({ email: TEST_EMAIL_SETTINGS, adminLoginRateLimit: { windowMs: 60_000, limit: 2 } }, mailer)
    const passwordStep = (client: TestAgent) => post(client, LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    // Finished logins cost nothing, however many.
    for (const code of [first, second, third]) {
      const client = request.agent(limited)
      await passwordStep(client).expect(200)
      await post(client, `${LOGIN}/two-factor`, { recoveryCode: code }).expect(200)
    }
    // Unfinished ones count: the third is refused.
    await passwordStep(request.agent(limited)).expect(200)
    await passwordStep(request.agent(limited)).expect(200)
    expect((await passwordStep(request.agent(limited))).status).toBe(429)
  })
})

describe('access and validation', () => {
  it('account security is for logged-in admins only, and changes must come from the GPEC site', async () => {
    expect((await request(app).get(ACCOUNT)).status).toBe(401)
    expect((await request(app).post(`${ACCOUNT}/app`).set('Origin', ORIGIN)).status).toBe(401)
    expect((await agent.post(`${ACCOUNT}/app`).set('Origin', 'https://evil.example')).status).toBe(403)
  })

  it.each([
    ['an unknown field', { code: '123456', trustDevice: true }, 'trustDevice'],
    ['a code with letters', { code: '12345a' }, 'code'],
    ['a code too short', { code: '12345' }, 'code'],
    ['a code that is not text', { code: 123456 }, 'code'],
    ['both a code and a recovery code', { code: '123456', recoveryCode: 'abcde-fghij' }, 'code'],
    ['neither', {}, 'code'],
    ['a recovery code that is an object', { recoveryCode: { $ne: '' } }, 'recoveryCode'],
  ])('refuses %s at the login code step', async (_name, body, field) => {
    await turnOnApp()
    const { client } = await startLogin()
    const res = await post(client, `${LOGIN}/two-factor`, body)
    expect(res.status).toBe(400)
    expect(res.body.errors).toHaveProperty([field])
  })

  it('refuses a method that does not exist', async () => {
    expect((await post(agent, `${ACCOUNT}/enable`, { method: 'sms', code: '123456' })).body.errors).toHaveProperty(['method'])
  })
})
