import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll } from 'vitest'
import createApp from '../src/app.js'
import type { AppConfig } from '../src/app.js'

// Development-like settings with a generous rate limit, so only the rate-limit tests hit it.
export function testApp(overrides: Partial<AppConfig> = {}) {
  return createApp({
    isProduction: false,
    clientOrigins: ['http://localhost:5173'],
    formRateLimit: { windowMs: 60_000, limit: 1000 },
    ...overrides,
  })
}

// An in-memory MongoDB per test file: never gpec_dev or production. Collections are emptied after each test.
export function useTestDatabase() {
  let server: MongoMemoryServer | undefined
  beforeAll(async () => {
    server = await MongoMemoryServer.create()
    await mongoose.connect(server.getUri('gpec_test'))
  })
  afterEach(async () => {
    const collections = await mongoose.connection.db?.collections() ?? []
    await Promise.all(collections.map((collection) => collection.deleteMany({})))
  })
  afterAll(async () => {
    await mongoose.disconnect()
    await server?.stop()
  })
}
