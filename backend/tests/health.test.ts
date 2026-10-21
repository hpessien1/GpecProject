import mongoose from 'mongoose'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testApp, useTestDatabase } from './helpers.js'

describe('GET /api/health', () => {
  useTestDatabase()
  const app = testApp()
  afterEach(() => { vi.restoreAllMocks() })

  it('is ok when the database answers', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('is unavailable when the database does not answer in time', async () => {
    vi.spyOn(mongoose.mongo.Admin.prototype, 'ping').mockImplementation(() => new Promise(() => {}))
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'unavailable', message: 'The database cannot be reached.' })
  })

  it('is unavailable when the ping fails, without revealing why', async () => {
    vi.spyOn(mongoose.mongo.Admin.prototype, 'ping').mockRejectedValue(new Error('connection refused by 10.0.0.1'))
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(503)
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.1')
  })
})
