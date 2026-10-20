import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { testApp } from './helpers.js'

describe('app', () => {
  const app = testApp()

  it('answers the health check with security headers and no x-powered-by', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ message: 'Route not found.' })
  })

  it('rejects malformed JSON with a clear 400', async () => {
    const res = await request(app).post('/api/enquiries').set('Content-Type', 'application/json').send('{bad')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: 'Request body must be valid JSON.' })
  })

  it('allows the configured origin and no other', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const other = await request(app).get('/api/health').set('Origin', 'https://attacker.example')
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
  })
})
