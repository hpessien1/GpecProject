import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import createApp from '../src/app.js'
import type { AppConfig } from '../src/app.js'
import AdminUser from '../src/models/AdminUser.js'
import type { BreachedPasswordCheck } from '../src/services/breachedPasswords.js'
import type { EmailMessage, Mailer } from '../src/services/email.js'
import type { ImageStore, StoredImage } from '../src/services/imageStore.js'
import { hashPassword } from '../src/services/passwords.js'
import { PaystackError } from '../src/services/paystack.js'
import type { PaystackClient, TransactionResult } from '../src/services/paystack.js'

// Development-like settings with generous rate limits, so only the rate-limit tests hit them.
// Stands in for Pwned Passwords so tests never reach the internet: no password is breached.
export const noBreaches: BreachedPasswordCheck = { isBreached: async () => false }

// mailer: a RecordingMailer to check emails; null (the default) means email is off.
// imageStore: a MemoryImageStore to turn photo uploads on; null (the default) means uploads are off.
// paystack: a FakePaystack to turn payments on (with TEST_PAYMENTS); null (the default) means off.
export function testApp(overrides: Partial<AppConfig> = {}, mailer: Mailer | null = null, breachCheck: BreachedPasswordCheck = noBreaches, imageStore: ImageStore | null = null, paystack: PaystackClient | null = null) {
  return createApp({
    isProduction: false,
    clientOrigins: ['http://localhost:5173'],
    formRateLimit: { windowMs: 60_000, limit: 1000 },
    adminLoginRateLimit: { windowMs: 60_000, limit: 1000 },
    orderRateLimit: { windowMs: 60_000, limit: 1000 },
    checkoutReadRateLimit: { windowMs: 60_000, limit: 1000 },
    webhookRateLimit: { windowMs: 60_000, limit: 1000 },
    currency: 'NGN',
    email: null,
    imageStorage: null,
    payments: null,
    ...overrides,
  }, mailer, breachCheck, imageStore, paystack)
}

// An in-memory MongoDB per test file: never gpec_dev or production. A single-node replica set, because
// admin changes use transactions (as on Atlas). Collections are emptied after each test.
export function useTestDatabase() {
  let server: MongoMemoryReplSet | undefined
  beforeAll(async () => {
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
    await mongoose.connect(server.getUri('gpec_test'))
    // Transactions cannot create collections, so make them (and their unique indexes) up front.
    await Promise.all(Object.values(mongoose.models).map((model) => model.createCollection().then(() => model.syncIndexes())))
  }, 60_000)
  afterEach(async () => {
    const collections = await mongoose.connection.db?.collections() ?? []
    await Promise.all(collections.map((collection) => collection.deleteMany({})))
  })
  afterAll(async () => {
    await mongoose.disconnect()
    await server?.stop()
  })
}

export const TEST_ADMIN = { email: 'admin@example.test', name: 'Test Admin', password: 'correct horse battery staple' }

export async function createTestAdmin(overrides: { email?: string, name?: string, isActive?: boolean } = {}) {
  const { password, ...details } = TEST_ADMIN
  return AdminUser.create({ ...details, ...overrides, passwordHash: await hashPassword(password) })
}

// A Supertest agent that keeps the session cookie, like a logged-in browser, sending the site's Origin.
export async function loggedInAgent(app: ReturnType<typeof testApp>, email = TEST_ADMIN.email) {
  const agent = request.agent(app)
  const res = await agent.post('/api/admin/session').set('Origin', 'http://localhost:5173').send({ email, password: TEST_ADMIN.password })
  if (res.status !== 200) throw new Error(`Test login failed: ${res.status} ${JSON.stringify(res.body)}`)
  return agent
}

// Records emails instead of sending them. failWith makes every send fail, like an SES outage.
export class RecordingMailer implements Mailer {
  readonly sent: EmailMessage[] = []
  failWith: Error | null = null

  async send(message: EmailMessage) {
    if (this.failWith) throw this.failWith
    this.sent.push(message)
  }
}

export const TEST_EMAIL_SETTINGS = {
  region: 'eu-west-1',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
  from: 'GPEC <notifications@example.com>',
  staffRecipients: ['staff1@example.com', 'staff2@example.com'],
  siteUrl: 'https://www.example.com',
}

// Stands in for the S3 bucket in tests, keeping what was stored so tests can inspect it.
export class MemoryImageStore implements ImageStore {
  readonly objects = new Map<string, StoredImage>()
  async put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body: new Uint8Array(body), contentType })
  }
  async get(key: string) {
    return this.objects.get(key) ?? null
  }
}

// Paystack settings for tests: a test key and Paystack's published local rate (1.5% + ₦100, the ₦100
// waived under ₦2,500, at most ₦2,000), in kobo.
export const TEST_PAYMENTS = {
  secretKey: 'sk_test_0123456789abcdef',
  testMode: true,
  fee: { percentBasisPoints: 150, flat: 10_000, flatWaivedBelow: 250_000, cap: 200_000 },
  siteUrl: 'https://www.example.com',
}

// Stands in for Paystack's API. Records each transaction started; tests set what verify reports.
export class FakePaystack implements PaystackClient {
  readonly started: Parameters<PaystackClient['initialize']>[0][] = []
  readonly verified: string[] = []
  // What verify answers per reference; absent means Paystack has no such transaction.
  readonly results = new Map<string, TransactionResult>()
  failInitialize = false
  failVerify = false

  async initialize(transaction: Parameters<PaystackClient['initialize']>[0]) {
    if (this.failInitialize) throw new PaystackError('Paystack did not start the payment (HTTP 500).')
    this.started.push(transaction)
    return { authorizationUrl: `https://checkout.paystack.com/test-${transaction.reference}` }
  }

  async verify(reference: string) {
    this.verified.push(reference)
    if (this.failVerify) throw new PaystackError('Paystack could not be reached (TimeoutError).')
    return this.results.get(reference) ?? null
  }
}
