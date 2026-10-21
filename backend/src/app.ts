import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import type { Config, RateLimitSettings } from './config.js'
import contactRequestsRouter from './routes/contactRequests.js'
import enquiriesRouter from './routes/enquiries.js'
import productsRouter from './routes/products.js'

export type AppConfig = Pick<Config, 'isProduction' | 'clientOrigins' | 'formRateLimit'>

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

export default function createApp(config: AppConfig) {
  const app = express()
  app.disable('x-powered-by')
  // In production the API sits behind Coolify's proxy; trust one hop so req.ip (and so the rate
  // limit) is the visitor's address. Without it, every visitor shares the proxy's single budget.
  if (config.isProduction) app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: config.clientOrigins, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }))
  app.use(express.json({ limit: '32kb' }))

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api/products', productsRouter)
  app.use('/api/enquiries', formLimiter(config.formRateLimit), enquiriesRouter)
  app.use('/api/contact-requests', formLimiter(config.formRateLimit), contactRequestsRouter)
  app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }))
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON.' })
    if (error instanceof Error && (error.name === 'ValidationError' || error.name === 'StrictModeError')) return res.status(400).json({ message: 'Check the details and try again.' })
    console.error(error)
    return res.status(500).json({ message: 'Something went wrong on our side. Please try again.' })
  })
  return app
}
