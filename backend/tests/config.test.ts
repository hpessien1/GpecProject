import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('uses development defaults when nothing is set', () => {
    const config = loadConfig({})
    expect(config).toMatchObject({
      nodeEnv: 'development',
      isProduction: false,
      port: 5001,
      mongoUri: 'mongodb://127.0.0.1:27017/gpec_dev',
      clientOrigins: ['http://localhost:5173'],
    })
    expect(config.formRateLimit.limit).toBe(100)
  })

  it('accepts a valid production configuration and applies the stricter form limit', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      MONGODB_URI: 'mongodb+srv://user:secret@cluster.example.net/gpec',
      CLIENT_ORIGIN: 'https://gpec.example.com, https://www.gpec.example.com',
    })
    expect(config.isProduction).toBe(true)
    expect(config.port).toBe(8080)
    expect(config.clientOrigins).toEqual(['https://gpec.example.com', 'https://www.gpec.example.com'])
    expect(config.formRateLimit.limit).toBe(10)
  })

  it('requires MONGODB_URI in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://gpec.example.com' }))
      .toThrow('MONGODB_URI is required in production')
  })

  it('treats an empty MONGODB_URI as missing in production', () => {
    const load = () => loadConfig({ NODE_ENV: 'production', MONGODB_URI: '', CLIENT_ORIGIN: 'https://gpec.example.com' })
    expect(load).toThrow('Invalid configuration:\n- MONGODB_URI is required in production')
    expect(load).not.toThrow('must start with')
  })

  it.each(['*', 'null'])('rejects "%s" as an allowed origin', (origin) => {
    expect(() => loadConfig({ CLIENT_ORIGIN: origin })).toThrow('is not allowed')
  })

  it('rejects http origins in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://db/gpec', CLIENT_ORIGIN: 'http://gpec.example.com' }))
      .toThrow('must use https in production')
  })

  it('rejects an origin that includes a path', () => {
    expect(() => loadConfig({ CLIENT_ORIGIN: 'http://localhost:5173/shop' })).toThrow('must be an origin only')
  })

  it('rejects a malformed MongoDB URI and an invalid port, reporting both', () => {
    const load = () => loadConfig({ MONGODB_URI: 'http://not-mongo', PORT: 'abc' })
    expect(load).toThrow('MONGODB_URI must start with mongodb:// or mongodb+srv://')
    expect(load).toThrow('- PORT ')
  })

  it('has no currency unless one is set, and never assumes one', () => {
    expect(loadConfig({}).currency).toBeNull()
    expect(loadConfig({ CURRENCY: '' }).currency).toBeNull()
    expect(loadConfig({ CURRENCY: ' ngn ' }).currency).toBe('NGN')
  })

  it('rejects a currency that is not an ISO 4217 code', () => {
    expect(() => loadConfig({ CURRENCY: 'NAIRA' })).toThrow('CURRENCY must be an ISO 4217 currency code')
  })

  it('applies the stricter admin login limit in production', () => {
    expect(loadConfig({}).adminLoginRateLimit.limit).toBe(50)
    expect(loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://db/gpec', CLIENT_ORIGIN: 'https://gpec.example.com' }).adminLoginRateLimit.limit).toBe(5)
  })
})
