import { z } from 'zod'

const FIFTEEN_MINUTES = 15 * 60 * 1000

export interface RateLimitSettings {
  windowMs: number
  limit: number
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
  // ISO 4217 code (e.g. NGN) for prices, or null until GPEC confirms it. Price editing and payments
  // stay off while it is null; there is deliberately no default.
  currency: string | null
}

const knownCurrencies = new Set(Intl.supportedValuesOf('currency'))

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),
  MONGODB_URI: z.string().trim().regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://').optional(),
  CLIENT_ORIGIN: z.string().trim().default('http://localhost:5173'),
  CURRENCY: z.string().trim().toUpperCase().refine((code) => knownCurrencies.has(code), 'must be an ISO 4217 currency code such as NGN').optional(),
}).superRefine((env, ctx) => {
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
    currency: parsed.CURRENCY ?? null,
  }
}
