import { z } from 'zod'

const FIFTEEN_MINUTES = 15 * 60 * 1000

export interface RateLimitSettings {
  windowMs: number
  limit: number
}

// Amazon SES settings. Email is on only when every one of these is set (see loadConfig).
export interface EmailSettings {
  region: string
  accessKeyId: string
  secretAccessKey: string
  // "GPEC <notifications@example.com>" or a bare address, on a domain verified in SES.
  from: string
  staffRecipients: string[]
  // The public site (FRONTEND_URL), for links in emails (e.g. to a contact request in the admin panel).
  siteUrl: string
}

// Amazon S3 bucket for uploaded product photos. Uploads are on only when every one of these is set.
// The bucket stays private: the API reads photos from it and serves them itself.
export interface ImageStorageSettings {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

// Paystack's fee on one transaction, from GPEC's own Paystack plan (never assumed in code). Amounts are
// in the currency's smallest unit (kobo). services/paystackFee.ts turns it into the customer's fee line.
export interface PaystackFeeRule {
  // 1.5% is 150 basis points.
  percentBasisPoints: number
  flat: number
  // Paystack waives the flat part on transactions below this amount (0: never waived).
  flatWaivedBelow: number
  // The most Paystack charges on one transaction.
  cap: number
}

// Online payment through Paystack's hosted page. On only when the secret key and every fee setting
// are set, together with CURRENCY and FRONTEND_URL (see loadConfig).
export interface PaymentSettings {
  secretKey: string
  // Test keys start with sk_test_; the checkout then shows a "Test mode" notice.
  testMode: boolean
  fee: PaystackFeeRule
  // The public site (FRONTEND_URL): Paystack sends customers back here after paying.
  siteUrl: string
}

export interface Config {
  nodeEnv: 'development' | 'test' | 'production'
  isProduction: boolean
  port: number
  mongoUri: string
  clientOrigins: string[]
  // Requests per IP to each public form route. Production is the security boundary; development and
  // test are looser on purpose so repeated manual and automated checks do not lock the developer out.
  formRateLimit: RateLimitSettings
  // Failed admin logins per IP. Successful logins do not count.
  adminLoginRateLimit: RateLimitSettings
  // Orders started per IP. Price quotes and payment checks (read-only) get a larger budget.
  orderRateLimit: RateLimitSettings
  checkoutReadRateLimit: RateLimitSettings
  // Paystack webhook deliveries per IP: generous, because Paystack retries, but bounded.
  webhookRateLimit: RateLimitSettings
  // ISO 4217 code (e.g. NGN) for prices, or null until GPEC confirms it. Price editing and payments
  // stay off while it is null; there is deliberately no default.
  currency: string | null
  // null: email notifications are off (nothing is sent; everything else works).
  email: EmailSettings | null
  // null: photo uploads are off (admins pick images already on the site; everything else works).
  imageStorage: ImageStorageSettings | null
  // null: online payment is off (checkout says so; everything else works).
  payments: PaymentSettings | null
}

const EMAIL_PATTERN = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/
// "Name <address>" or "address".
const FROM_PATTERN = /^(?:[^<>]+<)?([^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+)>?$/
const EMAIL_SETTINGS = ['SES_REGION', 'SES_ACCESS_KEY_ID', 'SES_SECRET_ACCESS_KEY', 'EMAIL_FROM', 'STAFF_NOTIFICATION_EMAILS'] as const
const IMAGE_STORAGE_SETTINGS = ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
const PAYMENT_SETTINGS = ['PAYSTACK_SECRET_KEY', 'PAYSTACK_FEE_PERCENT', 'PAYSTACK_FEE_FLAT', 'PAYSTACK_FEE_FLAT_WAIVED_BELOW', 'PAYSTACK_FEE_CAP'] as const
const AWS_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d$/

// A whole number of the smallest currency unit, e.g. 10000 (kobo) for ₦100.
const minorUnits = z.string().trim().regex(/^\d{1,12}$/, 'must be a whole number of the smallest currency unit (e.g. 10000 for ₦100)').transform(Number)

// "1.5" → 150 basis points, read as text so no floating-point rounding is involved. At most 10%.
function percentToBasisPoints(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

const knownCurrencies = new Set(Intl.supportedValuesOf('currency'))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),
  MONGODB_URI: z.string().trim().regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://').optional(),
  CLIENT_ORIGIN: z.string().trim().default('http://localhost:5173'),
  CURRENCY: z.string().trim().toUpperCase().refine((code) => knownCurrencies.has(code), 'must be an ISO 4217 currency code such as NGN').optional(),
  SES_REGION: z.string().trim().regex(AWS_REGION_PATTERN, 'must be an AWS region such as eu-west-1').optional(),
  SES_ACCESS_KEY_ID: z.string().trim().optional(),
  SES_SECRET_ACCESS_KEY: z.string().trim().optional(),
  EMAIL_FROM: z.string().trim().regex(FROM_PATTERN, 'must be an email address, optionally as "Name <address>"').optional(),
  STAFF_NOTIFICATION_EMAILS: z.string().trim().refine((list) => list.split(',').every((entry) => EMAIL_PATTERN.test(entry.trim())), 'must be a comma-separated list of email addresses').optional(),
  FRONTEND_URL: z.string().trim().optional(),
  S3_REGION: z.string().trim().regex(AWS_REGION_PATTERN, 'must be an AWS region such as eu-west-1').optional(),
  // S3's bucket naming rules: 3 to 63 lowercase letters, digits, dots, and hyphens.
  S3_BUCKET: z.string().trim().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'must be an S3 bucket name (lowercase letters, digits, dots, and hyphens)').optional(),
  S3_ACCESS_KEY_ID: z.string().trim().optional(),
  S3_SECRET_ACCESS_KEY: z.string().trim().optional(),
  PAYSTACK_SECRET_KEY: z.string().trim().regex(/^sk_(test|live)_[A-Za-z0-9]+$/, 'must be a Paystack secret key (sk_test_… or sk_live_…)').optional(),
  PAYSTACK_FEE_PERCENT: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, 'must be a percentage such as 1.5').transform(percentToBasisPoints).refine((points) => points <= 1000, 'must be at most 10').optional(),
  PAYSTACK_FEE_FLAT: minorUnits.optional(),
  PAYSTACK_FEE_FLAT_WAIVED_BELOW: minorUnits.optional(),
  PAYSTACK_FEE_CAP: minorUnits.refine((cap) => cap > 0, 'must be more than 0').optional(),
}).superRefine((env, ctx) => {
  // All or nothing, so a half-finished setup fails at startup instead of silently sending nothing.
  const setEmailSettings = EMAIL_SETTINGS.filter((name) => env[name] !== undefined)
  if (setEmailSettings.length > 0 && setEmailSettings.length < EMAIL_SETTINGS.length) {
    for (const name of EMAIL_SETTINGS.filter((setting) => env[setting] === undefined)) {
      ctx.addIssue({ code: 'custom', path: [name], message: 'is required when any email setting is set (email needs all of them)' })
    }
  }
  const setImageSettings = IMAGE_STORAGE_SETTINGS.filter((name) => env[name] !== undefined)
  if (setImageSettings.length > 0 && setImageSettings.length < IMAGE_STORAGE_SETTINGS.length) {
    for (const name of IMAGE_STORAGE_SETTINGS.filter((setting) => env[setting] === undefined)) {
      ctx.addIssue({ code: 'custom', path: [name], message: 'is required when any S3 setting is set (photo uploads need all of them)' })
    }
  }
  const setPaymentSettings = PAYMENT_SETTINGS.filter((name) => env[name] !== undefined)
  if (setPaymentSettings.length > 0) {
    for (const name of PAYMENT_SETTINGS.filter((setting) => env[setting] === undefined)) {
      ctx.addIssue({ code: 'custom', path: [name], message: 'is required when any Paystack setting is set (payments need all of them)' })
    }
    // A payment needs a currency, which is never defaulted, and a page to return the customer to.
    if (!env.CURRENCY) ctx.addIssue({ code: 'custom', path: ['CURRENCY'], message: 'is required when Paystack is configured' })
    if (!env.FRONTEND_URL) ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'is required when Paystack is configured (customers return there after paying)' })
  }
  // Emails link back to the site (FRONTEND_URL is also Paystack's return address).
  if (setEmailSettings.length === EMAIL_SETTINGS.length && !env.FRONTEND_URL) {
    ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'is required when email is configured (emails link to the site)' })
  }
  if (env.FRONTEND_URL) {
    let url: URL | null = null
    try { url = new URL(env.FRONTEND_URL) } catch { /* reported below */ }
    if (!url || url.origin !== env.FRONTEND_URL.replace(/\/$/, '')) ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'must be the site\'s address only, like https://www.example.com' })
    else if (env.NODE_ENV === 'production' && url.protocol !== 'https:') ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'must use https in production' })
  }
  if (env.NODE_ENV === 'production' && !env.MONGODB_URI) {
    ctx.addIssue({ code: 'custom', path: ['MONGODB_URI'], message: 'is required in production' })
  }
  for (const origin of env.CLIENT_ORIGIN.split(',').map((entry) => entry.trim())) {
    // A wildcard or "null" would let any site, or a sandboxed page, call the API from a browser.
    if (origin === '*' || origin.toLowerCase() === 'null') {
      ctx.addIssue({ code: 'custom', path: ['CLIENT_ORIGIN'], message: `"${origin}" is not allowed; list exact origins` })
      continue
    }
    let url: URL
    try {
      url = new URL(origin)
    } catch {
      ctx.addIssue({ code: 'custom', path: ['CLIENT_ORIGIN'], message: `"${origin}" is not a valid URL` })
      continue
    }
    if (url.origin !== origin) {
      ctx.addIssue({ code: 'custom', path: ['CLIENT_ORIGIN'], message: `"${origin}" must be an origin only, like ${url.origin}` })
    } else if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', path: ['CLIENT_ORIGIN'], message: `"${origin}" must use https in production` })
    }
  }
})

// Reads and checks configuration once at startup; throws a readable error listing every problem.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // A variable that exists but is empty (easy to leave in a dashboard) counts as not set.
  const definedEnv = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''))
  const result = envSchema.safeParse(definedEnv)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `- ${issue.path.join('.') || 'environment'} ${issue.message}`)
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`)
  }
  const parsed = result.data
  const isProduction = parsed.NODE_ENV === 'production'
  return {
    nodeEnv: parsed.NODE_ENV,
    isProduction,
    port: parsed.PORT,
    mongoUri: parsed.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/gpec_dev',
    clientOrigins: parsed.CLIENT_ORIGIN.split(',').map((entry) => entry.trim()),
    formRateLimit: { windowMs: FIFTEEN_MINUTES, limit: isProduction ? 10 : 100 },
    adminLoginRateLimit: { windowMs: FIFTEEN_MINUTES, limit: isProduction ? 5 : 50 },
    orderRateLimit: { windowMs: FIFTEEN_MINUTES, limit: isProduction ? 10 : 100 },
    checkoutReadRateLimit: { windowMs: FIFTEEN_MINUTES, limit: isProduction ? 120 : 1000 },
    webhookRateLimit: { windowMs: FIFTEEN_MINUTES, limit: isProduction ? 300 : 1000 },
    currency: parsed.CURRENCY ?? null,
    email: parsed.SES_REGION && parsed.SES_ACCESS_KEY_ID && parsed.SES_SECRET_ACCESS_KEY && parsed.EMAIL_FROM && parsed.STAFF_NOTIFICATION_EMAILS && parsed.FRONTEND_URL
      ? {
          region: parsed.SES_REGION,
          accessKeyId: parsed.SES_ACCESS_KEY_ID,
          secretAccessKey: parsed.SES_SECRET_ACCESS_KEY,
          from: parsed.EMAIL_FROM,
          staffRecipients: parsed.STAFF_NOTIFICATION_EMAILS.split(',').map((entry) => entry.trim()),
          siteUrl: parsed.FRONTEND_URL.replace(/\/$/, ''),
        }
      : null,
    imageStorage: parsed.S3_REGION && parsed.S3_BUCKET && parsed.S3_ACCESS_KEY_ID && parsed.S3_SECRET_ACCESS_KEY
      ? { region: parsed.S3_REGION, bucket: parsed.S3_BUCKET, accessKeyId: parsed.S3_ACCESS_KEY_ID, secretAccessKey: parsed.S3_SECRET_ACCESS_KEY }
      : null,
    payments: parsed.PAYSTACK_SECRET_KEY && parsed.PAYSTACK_FEE_PERCENT !== undefined && parsed.PAYSTACK_FEE_FLAT !== undefined
      && parsed.PAYSTACK_FEE_FLAT_WAIVED_BELOW !== undefined && parsed.PAYSTACK_FEE_CAP !== undefined && parsed.FRONTEND_URL
      ? {
          secretKey: parsed.PAYSTACK_SECRET_KEY,
          testMode: parsed.PAYSTACK_SECRET_KEY.startsWith('sk_test_'),
          fee: { percentBasisPoints: parsed.PAYSTACK_FEE_PERCENT, flat: parsed.PAYSTACK_FEE_FLAT, flatWaivedBelow: parsed.PAYSTACK_FEE_FLAT_WAIVED_BELOW, cap: parsed.PAYSTACK_FEE_CAP },
          siteUrl: parsed.FRONTEND_URL.replace(/\/$/, ''),
        }
      : null,
  }
}
