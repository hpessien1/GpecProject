import 'dotenv/config'
import mongoose from 'mongoose'
import createApp from './app.js'
import { loadConfig } from './config.js'
import { RepeatedRefusals, writeRepeatedRefusals } from './services/securityLog.js'
import type { Config } from './config.js'

// Production must use the gpec database. Anything else (gpec_dev, or Atlas's default "test" when the
// URI has no database name) means MONGODB_URI is wrong, and the app would otherwise connect silently.
const PRODUCTION_DATABASE = 'gpec'

let config: Config
try {
  config = loadConfig()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const app = createApp(config)
if (!config.email) console.info('Email notifications are off: Amazon SES is not configured (docs/RUNBOOK.md, "Email").')
if (!config.payments) console.info('Online payment is off: Paystack is not configured (docs/RUNBOOK.md, "Payments").')
else if (config.payments.testMode) console.info('Paystack is in test mode: no real money moves.')
if (!config.twoFactorKey) console.info('Authenticator apps for two-step login are off: TWO_FACTOR_ENCRYPTION_KEY is not set (docs/RUNBOOK.md, "Two-step login").')
if (!config.imageStorage) console.info('Product photo uploads and contact-form attachments are off: Amazon S3 is not configured (docs/RUNBOOK.md, "Product photos").')

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
  const databaseName = mongoose.connection.name
  if (config.isProduction && databaseName !== PRODUCTION_DATABASE) {
    console.error(`Refusing to start: production must use the "${PRODUCTION_DATABASE}" database, but MONGODB_URI points to "${databaseName}". Fix MONGODB_URI in Coolify.`)
    await mongoose.disconnect()
    process.exit(1)
  }
  const server = app.listen(config.port, () => console.log(`GPEC API listening on http://localhost:${config.port} (database: ${databaseName})`))
  // Docker stops a container with SIGTERM. Node running as the container's main process ignores it
  // unless handled, so Docker would wait 10 seconds and kill the API mid-request on every redeploy.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      console.log(`${signal} received; finishing open requests and shutting down.`)
      server.close(() => {
        // Counts of repeated refusals not yet written go into the security log first (audit S2-M02).
        const repeated: unknown = app.locals.repeatedRefusals
        const counts = repeated instanceof RepeatedRefusals ? writeRepeatedRefusals(repeated, true) : Promise.resolve()
        counts.finally(() => mongoose.disconnect().finally(() => process.exit(0)))
      })
    })
  }
} catch (error) {
  console.error('MongoDB connection failed.', error instanceof Error ? error.message : error)
  process.exit(1)
}
