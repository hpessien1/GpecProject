import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import type { Config, RateLimitSettings } from './config.js'
import { HttpError } from './errors.js'
import { sesMailer } from './services/email.js'
import { databaseIsReachable } from './services/health.js'
import type { Mailer } from './services/email.js'
import { pwnedPasswordsCheck } from './services/breachedPasswords.js'
import type { BreachedPasswordCheck } from './services/breachedPasswords.js'
import { s3ImageStore } from './services/imageStore.js'
import type { ImageStore } from './services/imageStore.js'
import { createNotifier } from './services/notifications.js'
import { requireAdmin } from './middleware/requireAdmin.js'
import { paystackClient } from './services/paystack.js'
import type { PaystackClient } from './services/paystack.js'
import adminAccountRouter from './routes/adminAccount.js'
import adminBankTransferRouter from './routes/adminBankTransfer.js'
import adminDeliveryAreasRouter from './routes/adminDeliveryAreas.js'
import adminOrdersRouter from './routes/adminOrders.js'
import adminProductImagesRouter from './routes/adminProductImages.js'
import adminProductsRouter from './routes/adminProducts.js'
import adminRequestsRouter from './routes/adminRequests.js'
import adminSessionRouter from './routes/adminSession.js'
import adminSiteContentRouter from './routes/adminSiteContent.js'
import checkoutRouter from './routes/checkout.js'
import contactRequestsRouter from './routes/contactRequests.js'
import paystackWebhookRouter from './routes/paystackWebhook.js'
import productImagesRouter from './routes/productImages.js'
import productsRouter from './routes/products.js'
import siteContentRouter from './routes/siteContent.js'

const SITE_CONTENT_ADMIN_PATH = '/api/admin/content'

export type AppConfig = Pick<Config, 'isProduction' | 'clientOrigins' | 'formRateLimit' | 'adminLoginRateLimit' | 'orderRateLimit' | 'checkoutReadRateLimit' | 'webhookRateLimit' | 'currency' | 'email' | 'imageStorage' | 'payments' | 'twoFactorKey'>

// Errors from express.json and express.raw carry a 4xx status and type (e.g. 'entity.too.large').
function isBodyReadError(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && 'type' in error && 'status' in error
    && typeof error.status === 'number' && error.status >= 400 && error.status < 500
}

// Each public form route gets its own per-IP budget (the contact form, and the checkout's routes).
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
// breachCheck: tests pass a stand-in; otherwise Pwned Passwords.
// imageStore: tests pass an in-memory store; otherwise Amazon S3 when configured, or nothing (uploads off).
// paystack: tests pass a stand-in; otherwise Paystack's API when payments are configured, or nothing.
export default function createApp(
  config: AppConfig,
  mailer: Mailer | null = config.email ? sesMailer(config.email) : null,
  breachCheck: BreachedPasswordCheck = pwnedPasswordsCheck(),
  imageStore: ImageStore | null = config.imageStorage ? s3ImageStore(config.imageStorage) : null,
  paystack: PaystackClient | null = config.payments ? paystackClient(config.payments.secretKey) : null,
) {
  const notifier = createNotifier(mailer, config.email)
  const app = express()
  app.disable('x-powered-by')
  // In production the API sits behind Coolify's proxy; trust one hop so req.ip (and so the rate
  // limit) is the visitor's address. Without it, every visitor shares the proxy's single budget.
  if (config.isProduction) app.set('trust proxy', 1)
  app.use(helmet())
  // credentials: the admin session cookie may be sent, but only from the listed origins.
  app.use(cors({ origin: config.clientOrigins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type'] }))
  // Before express.json: the webhook's signature is checked against the raw body (CLAUDE.md 4.1).
  app.use('/api/paystack/webhook', paystackWebhookRouter(config.payments?.secretKey ?? null, notifier, formLimiter(config.webhookRateLimit)))
  // A whole policy or FAQ is saved at once (up to 60,000 characters), so the site-content routes read
  // larger bodies, and only after the admin login check (below); every other route keeps 32kb.
  const json = express.json({ limit: '32kb' })
  app.use((req, res, next) => req.path.startsWith(SITE_CONTENT_ADMIN_PATH) ? next() : json(req, res, next))

  // 503 when MongoDB does not answer, so the health check reflects whether the API can do its job.
  app.get('/api/health', async (_req, res) => {
    if (await databaseIsReachable()) return res.json({ status: 'ok' })
    return res.status(503).json({ status: 'unavailable', message: 'The database cannot be reached.' })
  })
  app.use('/api/products', productsRouter(config.currency))
  app.use('/api/product-images', productImagesRouter(imageStore))
  app.use('/api/content', siteContentRouter())
  app.use('/api/contact-requests', formLimiter(config.formRateLimit), contactRequestsRouter(notifier))
  app.use('/api/checkout', checkoutRouter(config, paystack, notifier, { read: formLimiter(config.checkoutReadRateLimit), order: formLimiter(config.orderRateLimit) }))
  // Admin responses hold staff-only data; browsers and proxies must not keep copies.
  app.use('/api/admin', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  app.use('/api/admin/session', adminSessionRouter(config, breachCheck, imageStore !== null, notifier))
  app.use('/api/admin/account', requireAdmin(config.clientOrigins), adminAccountRouter(config, notifier))
  app.use('/api/admin/products', requireAdmin(config.clientOrigins), adminProductsRouter(config))
  app.use('/api/admin/product-images', requireAdmin(config.clientOrigins), adminProductImagesRouter(imageStore))
  app.use('/api/admin/contact-requests', requireAdmin(config.clientOrigins), adminRequestsRouter('contactRequest'))
  app.use('/api/admin/orders', requireAdmin(config.clientOrigins), adminOrdersRouter(notifier))
  app.use('/api/admin/delivery-areas', requireAdmin(config.clientOrigins), adminDeliveryAreasRouter(config))
  app.use('/api/admin/bank-transfer', requireAdmin(config.clientOrigins), adminBankTransferRouter(notifier))
  app.use(SITE_CONTENT_ADMIN_PATH, requireAdmin(config.clientOrigins), express.json({ limit: '256kb' }), adminSiteContentRouter())
  app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }))
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, code: error.code, errors: error.errors })
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON.' })
    // The body readers' own refusals (too large, unreadable encoding) are the client's mistake, not a
    // server error.
    if (isBodyReadError(error)) {
      return error.status === 413
        ? res.status(413).json({ message: 'This is too large to send.', code: 'PAYLOAD_TOO_LARGE' })
        : res.status(error.status).json({ message: 'The request could not be read.' })
    }
    if (error instanceof Error && (error.name === 'ValidationError' || error.name === 'StrictModeError')) return res.status(400).json({ message: 'Check the details and try again.' })
    console.error(error)
    return res.status(500).json({ message: 'Something went wrong on our side. Please try again.' })
  })
  return app
}
