import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import createApp from '../src/app.js'
import type { AppConfig } from '../src/app.js'
import AdminUser from '../src/models/AdminUser.js'
import { hashPassword } from '../src/services/passwords.js'

// Development-like settings with generous rate limits, so only the rate-limit tests hit them.
export function testApp(overrides: Partial<AppConfig> = {}) {
  return createApp({
    isProduction: false,
    clientOrigins: ['http://localhost:5173'],
    formRateLimit: { windowMs: 60_000, limit: 1000 },
    adminLoginRateLimit: { windowMs: 60_000, limit: 1000 },
    currency: 'NGN',
    ...overrides,
  })
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
