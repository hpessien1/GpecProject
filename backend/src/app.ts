import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import contactRequestsRouter from './routes/contactRequests.js'
import enquiriesRouter from './routes/enquiries.js'

export default function createApp() {
  const app = express()
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
  app.disable('x-powered-by')
  app.use(cors({ origin: clientOrigin, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }))
  app.use(express.json({ limit: '32kb' }))

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api/enquiries', enquiriesRouter)
  app.use('/api/contact-requests', contactRequestsRouter)
  app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }))
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ message: 'Request body must be valid JSON.' })
    if (error instanceof Error && (error.name === 'ValidationError' || error.name === 'StrictModeError')) return res.status(400).json({ message: 'Check enquiry details and try again.' })
    console.error(error)
    return res.status(500).json({ message: 'Unable to save enquiry. Please try again.' })
  })
  return app
}
