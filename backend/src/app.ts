import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import type { Config, RateLimitSettings } from './config.js'
import { HttpError } from './errors.js'
import { sesMailer } from './services/email.js'
import type { Mailer } from './services/email.js'
import { createNotifier } from './services/notifications.js'
import { requireAdmin } from './middleware/requireAdmin.js'
import adminProductsRouter from './routes/adminProducts.js'
import adminRequestsRouter from './routes/adminRequests.js'
import adminSessionRouter from './routes/adminSession.js'
import contactRequestsRouter from './routes/contactRequests.js'
import enquiriesRouter from './routes/enquiries.js'
import productsRouter from './routes/products.js'

export type AppConfig = Pick<Config, 'isProduction' | 'clientOrigins' | 'formRateLimit' | 'adminLoginRateLimit' | 'currency' | 'email'>

// Each public form route gets its own per-IP budget, so one form cannot exhaust the other's.
function formLimiter({ windowMs, limit }: RateLimitSettings) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many requests. Please wait a few minutes and try again.' },
  })
}

// mailer: tests pass a recorder; otherwise Amazon SES when email is configured, or nothing.
export default function createApp(config: AppConfig, mailer: Mailer | null = config.email ? sesMailer(config.email) : null) {
  const notifier = createNotifier(mailer, config.email)
  const app = express()
  app.disable('x-powered-by')
  // In production the API sits behind Coolify's proxy; trust one hop so req.ip (and so the rate
  // limit) is the visitor's address. Without it, every visitor shares the proxy's single budget.
  if (config.isProduction) app.set('trust proxy', 1)
  app.use(helmet())
  // credentials: the admin session cookie may be sent, but only from the listed origins.
  app.use(cors({ origin: config.clientOrigins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type'] }))
  app.use(express.json({ limit: '32kb' }))

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api/products', productsRouter)
  app.use('/api/enquiries', formLimiter(config.formRateLimit), enquiriesRouter(notifier))
  app.use('/api/contact-requests', formLimiter(config.formRateLimit), contactRequestsRouter(notifier))
  // Admin responses hold staff-only data; browsers and proxies must not keep copies.
  app.use('/api/admin', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  app.use('/api/admin/session', adminSessionRouter(config))
  app.use('/api/admin/products', requireAdmin(config.clientOrigins), adminProductsRouter(config))
  app.use('/api/admin/enquiries', requireAdmin(config.clientOrigins), adminRequestsRouter('enquiry'))
  app.use('/api/admin/contact-requests', requireAdmin(config.clientOrigins), adminRequestsRouter('contactRequest'))
  app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }))
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, code: error.code, errors: error.errors })
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON.' })
    if (error instanceof Error && (error.name === 'ValidationError' || error.name === 'StrictModeError')) return res.status(400).json({ message: 'Check the details and try again.' })
    console.error(error)
    return res.status(500).json({ message: 'Something went wrong on our side. Please try again.' })
  })
  return app
}
