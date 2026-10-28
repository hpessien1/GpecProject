import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import mongoose from 'mongoose'
import request from 'supertest'
import type TestAgent from 'supertest/lib/agent.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminUser from '../src/models/AdminUser.js'
import Order from '../src/models/Order.js'
import SecurityEvent from '../src/models/SecurityEvent.js'
import { createPasswordReset } from '../src/services/adminAuth.js'
import { seedDemoData } from '../src/services/demoData.js'
import { open } from '../src/services/secretBox.js'
import { currentStep, totpCode } from '../src/services/totp.js'
import { MemoryImageStore, RecordingMailer, TEST_ADMIN, TEST_EMAIL_SETTINGS, TEST_TWO_FACTOR_KEY, createTestAdmin, loggedInAgent, testApp, useTestDatabase } from './helpers.js'
import { samplePdf } from './pdfFixtures.js'

useTestDatabase()

// Audit M-06: who logged in (or tried to), changes to an admin's own login, and which customer records
// staff opened, kept for 12 months, so GPEC can notice and look into a misused account.

const ORIGIN = 'http://localhost:5173'
const LOGIN = '/api/admin/session'
const ACCOUNT = '/api/admin/account/two-factor'
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'
const NEW_PASSWORD = 'a brand new long passphrase'

let mailer: RecordingMailer
let app: ReturnType<typeof testApp>

beforeEach(async () => {
  mailer = new RecordingMailer()
  app = testApp({ email: TEST_EMAIL_SETTINGS }, mailer, undefined, new MemoryImageStore())
  await createTestAdmin()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const post = (client: TestAgent | ReturnType<typeof request>, path: string, body: object = {}) => (client as TestAgent).post(path).set('Origin', ORIGIN).set('User-Agent', BROWSER).send(body)

// Entries are written as the answer goes out, so wait for them.
async function events(count: number, filter: object = {}) {
  await vi.waitFor(async () => expect(await SecurityEvent.countDocuments(filter)).toBeGreaterThanOrEqual(count), { timeout: 2000 })
  return SecurityEvent.find(filter).sort({ createdAt: 1, _id: 1 }).lean()
}

async function lastEvent(action: string) {
  return (await events(1, { action })).at(-1)
}

const account = { email: TEST_ADMIN.email, name: TEST_ADMIN.name }

describe('logins', () => {
  it('records a login, with the address and browser, and nothing secret', async () => {
    const res = await post(request.agent(app), LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    expect(res.status).toBe(200)
    const event = await lastEvent('login.password')
    expect(event).toMatchObject({ outcome: 'success', reason: null, account, via: 'website', userAgent: BROWSER })
    expect(event?.ip).toMatch(/127\.0\.0\.1/)
    expect(JSON.stringify(event)).not.toContain(TEST_ADMIN.password)
  })

  it('records a wrong password against the account, and an unknown address without keeping it', async () => {
    await post(request(app), LOGIN, { email: TEST_ADMIN.email, password: 'not the right password' })
    expect(await lastEvent('login.password')).toMatchObject({ outcome: 'failure', reason: 'INVALID_CREDENTIALS', account })
    await post(request(app), LOGIN, { email: 'stranger@example.com', password: 'not the right password' })
    const unknown = (await events(2, { action: 'login.password' }))[1]
    expect(unknown).toMatchObject({ outcome: 'failure', reason: 'INVALID_CREDENTIALS', account: null })
    expect(JSON.stringify(unknown)).not.toContain('stranger@example.com')
  })

  it('records a deactivated account’s attempt as such', async () => {
    await AdminUser.updateOne({ email: TEST_ADMIN.email }, { isActive: false })
    await post(request(app), LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    expect(await lastEvent('login.password')).toMatchObject({ outcome: 'failure', reason: 'ACCOUNT_INACTIVE', account })
  })

  it('records logins refused for too many failed attempts', async () => {
    const limited = testApp({ adminLoginRateLimit: { windowMs: 60_000, limit: 1 } })
    await post(request(limited), LOGIN, { email: TEST_ADMIN.email, password: 'not the right password' })
    expect((await post(request(limited), LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })).status).toBe(429)
    expect((await events(2, { action: 'login.password' }))[1]).toMatchObject({ outcome: 'failure', reason: 'TOO_MANY_ATTEMPTS', account })
  })

  it('records both steps of a two-step login, and which kind of code was used', async () => {
    const agent = await loggedInAgent(app)
    await post(agent, `${ACCOUNT}/app`).expect(200)
    const sealed = (await AdminUser.findOne({ email: TEST_ADMIN.email }).lean())?.pendingTwoFactorSecret ?? ''
    const secret = open(sealed, TEST_TWO_FACTOR_KEY) as Buffer
    const enabled = await post(agent, `${ACCOUNT}/enable`, { method: 'app', password: TEST_ADMIN.password, code: totpCode(secret, currentStep()) })
    expect(enabled.status).toBe(200)
    expect(await lastEvent('twoFactor.enable')).toMatchObject({ outcome: 'success', account, detail: 'app' })

    const client = request.agent(app)
    await post(client, LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })
    expect((await events(2, { action: 'login.password' })).at(-1)).toMatchObject({ outcome: 'success', detail: 'code_needed', account })
    const wrong = totpCode(secret, currentStep() + 1) === '000000' ? '111111' : '000000'
    await post(client, `${LOGIN}/two-factor`, { code: wrong })
    expect(await lastEvent('login.code')).toMatchObject({ outcome: 'failure', reason: 'WRONG_CODE', account })
    await post(client, `${LOGIN}/two-factor`, { recoveryCode: enabled.body.recoveryCodes[0] }).expect(200)
    expect((await events(2, { action: 'login.code' }))[1]).toMatchObject({ outcome: 'success', detail: 'recovery_code', account })

    // New recovery codes, then two-step login turned off: each needs the password and a code.
    const renewed = await post(client, `${ACCOUNT}/recovery-codes`, { password: TEST_ADMIN.password, recoveryCode: enabled.body.recoveryCodes[1] })
    expect(renewed.status).toBe(200)
    expect(await lastEvent('twoFactor.recoveryCodes')).toMatchObject({ outcome: 'success', account })
    await post(client, `${ACCOUNT}/disable`, { password: 'not the right password', recoveryCode: renewed.body.recoveryCodes[0] })
    expect(await lastEvent('twoFactor.disable')).toMatchObject({ outcome: 'failure', reason: 'WRONG_PASSWORD', account })
    await post(client, `${ACCOUNT}/disable`, { password: TEST_ADMIN.password, recoveryCode: renewed.body.recoveryCodes[0] }).expect(200)
    expect((await events(2, { action: 'twoFactor.disable' }))[1]).toMatchObject({ outcome: 'success', account })
    const stored = JSON.stringify(await SecurityEvent.find().lean())
    expect(stored).not.toContain(enabled.body.recoveryCodes[0])
    expect(stored).not.toContain(wrong)
  })

  it('records logging out', async () => {
    const agent = await loggedInAgent(app)
    await agent.delete(LOGIN).set('Origin', ORIGIN).expect(204)
    expect(await lastEvent('logout')).toMatchObject({ outcome: 'success', account })
  })

  it('never stops a login when the record cannot be written', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(SecurityEvent, 'create').mockRejectedValue(new Error('database unavailable'))
    expect((await post(request.agent(app), LOGIN, { email: TEST_ADMIN.email, password: TEST_ADMIN.password })).status).toBe(200)
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining('Security log: an entry could not be saved')))
  })
})

describe('changes to an admin’s own login', () => {
  it('records password changes, including a wrong current password', async () => {
    const agent = await loggedInAgent(app)
    await post(agent, `${LOGIN}/password`, { currentPassword: 'not the right password', newPassword: NEW_PASSWORD })
    expect(await lastEvent('password.change')).toMatchObject({ outcome: 'failure', reason: 'WRONG_PASSWORD', account })
    await post(agent, `${LOGIN}/password`, { currentPassword: TEST_ADMIN.password, newPassword: NEW_PASSWORD }).expect(204)
    expect((await events(2, { action: 'password.change' }))[1]).toMatchObject({ outcome: 'success', account })
    expect(JSON.stringify(await SecurityEvent.find().lean())).not.toContain(NEW_PASSWORD)
  })

  it('records reset requests (an unknown address without keeping it) and resets', async () => {
    await post(request(app), `${LOGIN}/password-reset`, { email: TEST_ADMIN.email }).expect(202)
    expect(await lastEvent('password.resetRequest')).toMatchObject({ outcome: 'success', account })
    await post(request(app), `${LOGIN}/password-reset`, { email: 'stranger@example.com' }).expect(202)
    const unknown = (await events(2, { action: 'password.resetRequest' }))[1]
    expect(unknown).toMatchObject({ outcome: 'failure', reason: 'UNKNOWN_ACCOUNT', account: null })
    expect(JSON.stringify(unknown)).not.toContain('stranger@example.com')

    await post(request(app), `${LOGIN}/password-reset/confirm`, { token: 'x'.repeat(43), newPassword: NEW_PASSWORD })
    expect(await lastEvent('password.reset')).toMatchObject({ outcome: 'failure', reason: 'RESET_LINK_INVALID', account: null })
    const reset = await createPasswordReset(TEST_ADMIN.email)
    await post(request(app), `${LOGIN}/password-reset/confirm`, { token: reset?.token, newPassword: NEW_PASSWORD }).expect(204)
    const done = (await events(2, { action: 'password.reset' }))[1]
    expect(done).toMatchObject({ outcome: 'success', account })
    expect(JSON.stringify(done)).not.toContain(reset?.token ?? 'no token')
  })

  it('records a wrong password given again for a sensitive change', async () => {
    const agent = await loggedInAgent(app)
    await agent.patch('/api/admin/bank-transfer').set('Origin', ORIGIN).send({ accountNumber: '0123456789', password: 'not the right password' }).expect(400)
    expect(await lastEvent('password.confirm')).toMatchObject({ outcome: 'failure', reason: 'WRONG_PASSWORD', account })
  })

  it('records a change refused because it did not come from GPEC’s site', async () => {
    const agent = await loggedInAgent(app)
    await agent.patch('/api/admin/bank-transfer').set('Origin', 'https://evil.example').send({ accountNumber: '0123456789' }).expect(403)
    expect(await lastEvent('access.refused')).toMatchObject({ outcome: 'failure', reason: 'ORIGIN_NOT_ALLOWED' })
  })
})

describe('customer records staff open', () => {
  let agent: TestAgent
  beforeEach(async () => {
    await seedDemoData()
    agent = await loggedInAgent(app)
  })

  it('records opening an order and a contact request, by reference only', async () => {
    const order = await Order.findOne().lean()
    await agent.get(`/api/admin/orders/${order?.reference}`).expect(200)
    expect(await lastEvent('record.order')).toMatchObject({ outcome: 'success', account, target: { type: 'order', id: order?.reference } })
    const list = await agent.get('/api/admin/contact-requests').expect(200)
    const reference = list.body.items[0].reference
    await agent.get(`/api/admin/contact-requests/${reference}`).expect(200)
    const opened = await lastEvent('record.contactRequest')
    expect(opened).toMatchObject({ outcome: 'success', account, target: { type: 'contactRequest', id: reference } })
    // Only the reference: no names, emails, or messages.
    expect(JSON.stringify(opened)).not.toContain(list.body.items[0].customer?.email ?? list.body.items[0].email ?? '@example.com')
  })

  it('does not record lists, histories, or notes, only opening a record', async () => {
    const order = await Order.findOne().lean()
    await agent.get('/api/admin/orders').expect(200)
    await agent.get(`/api/admin/orders/${order?.reference}/history`).expect(200)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await SecurityEvent.countDocuments({ action: { $regex: /^record\./ } })).toBe(0)
  })

  it('records opening an attached file', async () => {
    const store = new MemoryImageStore()
    const withFiles = testApp({ email: TEST_EMAIL_SETTINGS }, mailer, undefined, store)
    const pdf = await samplePdf()
    const sent = await request(withFiles).post('/api/contact-requests').field('fullName', 'Ada Buyer').field('email', 'ada@example.com').field('message', 'See the drawing.').attach('files', pdf, 'drawing.pdf').expect(201)
    const filesAgent = await loggedInAgent(withFiles)
    const detail = await filesAgent.get(`/api/admin/contact-requests/${sent.body.reference}`).expect(200)
    const fileId = detail.body.item.attachments[0].id
    await filesAgent.get(`/api/admin/contact-requests/${sent.body.reference}/files/${fileId}`).expect(200)
    expect(await lastEvent('record.file')).toMatchObject({ outcome: 'success', account, target: { type: 'file', id: `${sent.body.reference}/${fileId}` } })
  })
})

describe('the security log screen', () => {
  const LOG = '/api/admin/security-log'

  it('is for admins only, read-only, and newest first, ten to a page', async () => {
    expect((await request(app).get(LOG)).status).toBe(401)
    const agent = await loggedInAgent(app)
    for (let i = 0; i < 11; i++) await post(request(app), LOGIN, { email: TEST_ADMIN.email, password: 'not the right password' })
    await events(12)
    const first = await agent.get(LOG).expect(200)
    expect(first.headers['cache-control']).toBe('no-store')
    expect(first.body.entries).toHaveLength(10)
    expect(first.body.entries[0]).toMatchObject({ action: 'login.password', outcome: 'failure', account, via: 'website', userAgent: BROWSER })
    expect(first.body.entries[0].id).toBeUndefined()
    expect(first.body).toMatchObject({ page: 1, pageSize: 10, totalPages: 2 })
    const total = first.body.total
    expect(total).toBeGreaterThanOrEqual(12)
    const second = await agent.get(`${LOG}?page=2`).expect(200)
    expect(second.body.entries).toHaveLength(total - 10)
    expect(second.body).toMatchObject({ page: 2, totalPages: 2, total })
    // The oldest entry is on the last page, not repeated from the first.
    expect(second.body.entries.at(-1)).toMatchObject({ action: 'login.password', outcome: 'success' })
    expect((await agent.get(`${LOG}?page=0`)).status).toBe(400)
    // Nothing can change or remove an entry.
    expect((await agent.delete(LOG).set('Origin', ORIGIN)).status).toBe(404)
    expect((await agent.patch(LOG).set('Origin', ORIGIN).send({})).status).toBe(404)
  })

  it('lists every account to filter by, and shows one account’s entries', async () => {
    const second = await createTestAdmin({ email: 'second@example.test', name: 'Second Admin' })
    await loggedInAgent(app, 'second@example.test')
    const agent = await loggedInAgent(app)
    await events(2)
    const all = await agent.get(LOG).expect(200)
    expect(all.body.accounts).toEqual(expect.arrayContaining([{ id: String(second._id), name: 'Second Admin', email: 'second@example.test' }]))
    const one = await agent.get(`${LOG}?account=${second._id}`).expect(200)
    expect(one.body.entries.length).toBeGreaterThan(0)
    expect(one.body.entries.every((entry: { account: { email: string } }) => entry.account.email === 'second@example.test')).toBe(true)
    expect((await agent.get(`${LOG}?account=not-an-id`)).status).toBe(400)
  })

  it('shows the entries between two dates, the first included and the last not, with or without one account', async () => {
    const agent = await loggedInAgent(app)
    await events(1)
    await SecurityEvent.deleteMany({})
    const admin = await AdminUser.findOne({ email: TEST_ADMIN.email }).lean()
    const at = (iso: string, fields: object = {}) => ({ action: 'logout', outcome: 'success', via: 'website', account: { adminId: admin?._id, email: TEST_ADMIN.email, name: TEST_ADMIN.name, role: 'admin' }, createdAt: new Date(iso), ...fields })
    await SecurityEvent.collection.insertMany([
      at('2026-10-25T22:59:59.999Z'),
      at('2026-10-25T23:00:00.000Z'),
      at('2026-10-26T12:00:00.000Z', { account: null }),
      at('2026-10-26T22:59:59.999Z'),
      at('2026-10-26T23:00:00.000Z'),
    ])
    const between = (query: string) => agent.get(`${LOG}?${query}`).expect(200).then((reply) => reply.body)
    // 26 October on Nigeria's calendar (UTC+1), as a browser there sends it.
    const day = 'from=2026-10-25T23:00:00.000Z&to=2026-10-26T23:00:00.000Z'
    const oneDay = await between(day)
    expect(oneDay.total).toBe(3)
    expect(oneDay.entries.map((entry: { createdAt: string }) => entry.createdAt)).toEqual(['2026-10-26T22:59:59.999Z', '2026-10-26T12:00:00.000Z', '2026-10-25T23:00:00.000Z'])
    expect((await between(`${day}&account=${admin?._id}`)).total).toBe(2)
    // Either end may be left open, and an offset is read as such.
    expect((await between('from=2026-10-26T23:00:00.000Z')).total).toBe(1)
    expect((await between('to=2026-10-26T00:00:00%2B01:00')).total).toBe(1)
    for (const query of ['from=yesterday', 'from=2026-10-26', 'to=2026-13-45T00:00:00Z', 'from=2026-10-26T23:00:00Z&from=2026-10-27T23:00:00Z', `from=2026-10-26T23:00:00Z&to=2026-10-25T23:00:00Z`, 'from=2026-10-26T23:00:00Z&to=2026-10-26T23:00:00Z']) {
      const refused = await agent.get(`${LOG}?${query}`)
      expect({ query, status: refused.status }).toEqual({ query, status: 400 })
    }
  })
})

describe('keeping entries', () => {
  it('deletes them automatically after 12 months', async () => {
    await SecurityEvent.syncIndexes()
    const indexes = await SecurityEvent.collection.indexes()
    expect(indexes.find((index) => index.expireAfterSeconds !== undefined)).toMatchObject({ key: { createdAt: 1 }, expireAfterSeconds: 365 * 24 * 60 * 60 })
  })
})

// The command on the server (npm run admin:create), run for real against this test database. The
// real .env is switched off, so it cannot reach any other database.
describe('the admin command', () => {
  const run = promisify(execFile)
  async function command(...args: string[]) {
    const uri = mongoose.connection.getClient().options.hosts.map((host) => `${host.host}:${host.port}`).join(',')
    await run(process.execPath, ['--import', 'tsx', 'src/scripts/createAdmin.ts', ...args], {
      env: { ...process.env, DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'test', MONGODB_URI: `mongodb://${uri}/${mongoose.connection.name}?directConnection=true`, CLIENT_ORIGIN: ORIGIN },
    })
  }

  it('records creating an account, a password reset, and two-step login turned off, by the command', async () => {
    await command('--email', 'new@example.test', '--name', 'New Admin')
    await command('--email', 'new@example.test', '--reset')
    await command('--email', 'new@example.test', '--disable-2fa')
    const entries = await SecurityEvent.find({ via: 'command line' }).sort({ createdAt: 1 }).lean()
    expect(entries.map((entry) => entry.action)).toEqual(['command.create', 'command.reset', 'command.disableTwoFactor'])
    expect(entries.every((entry) => entry.outcome === 'success' && entry.account?.email === 'new@example.test' && entry.ip === '')).toBe(true)
  }, 30_000)
})

describe('the server’s own log of unexpected errors', () => {
  it('keeps the kind of error, the route, and where in the code, but not its message or the request', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Order, 'findOne').mockImplementationOnce(() => { throw new Error('E11000 duplicate key error dup key: { email: "ada@example.com" }') })
    const agent = await loggedInAgent(app)
    expect((await agent.get('/api/admin/orders/GPEC-O-2026-ABCDEF12?note=private')).status).toBe(500)
    const report = logged.mock.calls.map((call) => String(call[0])).find((line) => line.startsWith('Unexpected error'))
    expect(report).toMatch(/^Unexpected error on GET \/api\/admin\/orders\/:reference: Error\n\s+at /)
    expect(report).not.toContain('ada@example.com')
    expect(report).not.toContain('GPEC-O-2026-ABCDEF12')
    expect(report).not.toContain('private')
  })
})
