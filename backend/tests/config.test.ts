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

  it('applies the stricter admin login and reset-attempt limits in production', () => {
    const production = loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://db/gpec', CLIENT_ORIGIN: 'https://gpec.example.com' })
    expect(loadConfig({}).adminLoginRateLimit.limit).toBe(50)
    expect(production.adminLoginRateLimit.limit).toBe(5)
    expect(loadConfig({}).passwordResetAttemptRateLimit.limit).toBe(200)
    expect(production.passwordResetAttemptRateLimit.limit).toBe(20)
  })

  it('leaves email off when no email setting is given', () => {
    expect(loadConfig({}).email).toBeNull()
  })

  it('turns email on only when every setting is given, and parses them', () => {
    const config = loadConfig({
      SES_REGION: 'eu-west-1', SES_ACCESS_KEY_ID: 'AKIAEXAMPLE', SES_SECRET_ACCESS_KEY: 'secret',
      EMAIL_FROM: 'GPEC <notifications@example.com>', STAFF_NOTIFICATION_EMAILS: 'a@example.com, b@example.com',
      FRONTEND_URL: 'http://localhost:5173/',
    })
    expect(config.email).toEqual({ region: 'eu-west-1', accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret', from: 'GPEC <notifications@example.com>', staffRecipients: ['a@example.com', 'b@example.com'], siteUrl: 'http://localhost:5173' })
  })

  it('refuses a partial email setup and names what is missing', () => {
    const load = () => loadConfig({ SES_REGION: 'eu-west-1', EMAIL_FROM: 'notifications@example.com' })
    expect(load).toThrow('SES_ACCESS_KEY_ID is required when any email setting is set')
    expect(load).toThrow('STAFF_NOTIFICATION_EMAILS is required')
  })

  it('requires FRONTEND_URL once email is configured, and https in production', () => {
    const email = { SES_REGION: 'eu-west-1', SES_ACCESS_KEY_ID: 'k', SES_SECRET_ACCESS_KEY: 's', EMAIL_FROM: 'n@example.com', STAFF_NOTIFICATION_EMAILS: 'a@example.com' }
    expect(() => loadConfig(email)).toThrow('FRONTEND_URL is required when email is configured')
    expect(() => loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://db/gpec', CLIENT_ORIGIN: 'https://gpec.example.com', FRONTEND_URL: 'http://gpec.example.com' })).toThrow('FRONTEND_URL must use https in production')
  })

  it.each([
    ['SES_REGION', 'Europe'],
    ['EMAIL_FROM', 'not an address'],
    ['STAFF_NOTIFICATION_EMAILS', 'a@example.com, nobody'],
    ['FRONTEND_URL', 'https://www.example.com/shop'],
    ['S3_REGION', 'Europe'],
    ['S3_BUCKET', 'GPEC_Images'],
  ])('rejects an invalid %s', (name, value) => {
    expect(() => loadConfig({ [name]: value })).toThrow(name)
  })

  it('turns photo uploads on only when every S3 setting is given', () => {
    expect(loadConfig({}).imageStorage).toBeNull()
    const config = loadConfig({ S3_REGION: 'eu-west-1', S3_BUCKET: 'gpec-product-images', S3_ACCESS_KEY_ID: 'AKIAEXAMPLE', S3_SECRET_ACCESS_KEY: 'secret' })
    expect(config.imageStorage).toEqual({ region: 'eu-west-1', bucket: 'gpec-product-images', accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' })
  })

  it('refuses a partial S3 setup and names what is missing', () => {
    const load = () => loadConfig({ S3_REGION: 'eu-west-1', S3_BUCKET: 'gpec-product-images' })
    expect(load).toThrow('S3_ACCESS_KEY_ID is required when any S3 setting is set')
    expect(load).toThrow('S3_SECRET_ACCESS_KEY is required when any S3 setting is set')
  })
  describe('Paystack', () => {
    const payments = {
      CURRENCY: 'NGN',
      FRONTEND_URL: 'https://www.example.com/',
      PAYSTACK_SECRET_KEY: 'sk_test_fake',
      PAYSTACK_FEE_PERCENT: '1.5',
      PAYSTACK_FEE_FLAT: '10000',
      PAYSTACK_FEE_FLAT_WAIVED_BELOW: '250000',
      PAYSTACK_FEE_CAP: '200000',
    }

    it('leaves payments off when no Paystack setting is given', () => {
      expect(loadConfig({}).payments).toBeNull()
    })

    it('turns payments on with every setting, reading the percentage exactly, in test mode for a test key', () => {
      expect(loadConfig(payments).payments).toEqual({
        secretKey: 'sk_test_fake',
        testMode: true,
        fee: { percentBasisPoints: 150, flat: 10_000, flatWaivedBelow: 250_000, cap: 200_000 },
        siteUrl: 'https://www.example.com',
      })
      expect(loadConfig({ ...payments, PAYSTACK_FEE_PERCENT: '1.95' }).payments?.fee.percentBasisPoints).toBe(195)
      expect(loadConfig({ ...payments, PAYSTACK_SECRET_KEY: 'sk_live_fake' }).payments?.testMode).toBe(false)
    })

    it('refuses a partial setup and names what is missing', () => {
      expect(() => loadConfig({ ...payments, PAYSTACK_FEE_CAP: undefined })).toThrow('PAYSTACK_FEE_CAP is required when any Paystack setting is set')
    })

    it('requires a currency and a return address, never assuming either', () => {
      expect(() => loadConfig({ ...payments, CURRENCY: undefined })).toThrow('CURRENCY is required when Paystack is configured')
      expect(() => loadConfig({ ...payments, FRONTEND_URL: undefined })).toThrow('FRONTEND_URL is required when Paystack is configured')
    })

    it.each([
      ['PAYSTACK_SECRET_KEY', 'pk_test_fake'],
      ['PAYSTACK_FEE_PERCENT', '15'],
      ['PAYSTACK_FEE_PERCENT', '1,5'],
      ['PAYSTACK_FEE_FLAT', '100.50'],
      ['PAYSTACK_FEE_CAP', '0'],
    ])('rejects %s=%s', (name, value) => {
      expect(() => loadConfig({ ...payments, [name]: value })).toThrow(name)
    })
  })
})
