import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { testApp } from './helpers.js'

// Invalid bodies are rejected with 400 before reaching the database, but still count toward the limit.
const formRateLimit = { windowMs: 60_000, limit: 2 }

describe('form rate limits', () => {
  it('returns 429 with a readable message once an IP exceeds the limit', async () => {
    const app = testApp({ formRateLimit })
    expect((await request(app).post('/api/contact-requests').send({})).status).toBe(400)
    expect((await request(app).post('/api/contact-requests').send({})).status).toBe(400)
    const limited = await request(app).post('/api/contact-requests').send({})
    expect(limited.status).toBe(429)
    expect(limited.body).toEqual({ message: 'Too many requests. Please wait a few minutes and try again.' })
    expect(limited.headers.ratelimit).toBeDefined()
  })

  it('in production, limits each visitor separately behind one proxy hop', async () => {
    const app = testApp({ isProduction: true, formRateLimit })
    for (let attempt = 0; attempt < 3; attempt++) {
      await request(app).post('/api/contact-requests').set('X-Forwarded-For', '203.0.113.10').send({})
    }
    const otherVisitor = await request(app).post('/api/contact-requests').set('X-Forwarded-For', '203.0.113.20').send({})
    expect(otherVisitor.status).toBe(400)
  })

  it('outside production, ignores X-Forwarded-For so it cannot be used to dodge the limit', async () => {
    const app = testApp({ formRateLimit })
    await request(app).post('/api/contact-requests').set('X-Forwarded-For', '203.0.113.1').send({})
    await request(app).post('/api/contact-requests').set('X-Forwarded-For', '203.0.113.2').send({})
    const third = await request(app).post('/api/contact-requests').set('X-Forwarded-For', '203.0.113.3').send({})
    expect(third.status).toBe(429)
  })
})
