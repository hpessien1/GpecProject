import 'dotenv/config'
import mongoose from 'mongoose'
import createApp from './app.js'
import { loadConfig } from './config.js'
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

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
  const databaseName = mongoose.connection.name
  if (config.isProduction && databaseName !== PRODUCTION_DATABASE) {
    console.error(`Refusing to start: production must use the "${PRODUCTION_DATABASE}" database, but MONGODB_URI points to "${databaseName}". Fix MONGODB_URI in Coolify.`)
    await mongoose.disconnect()
    process.exit(1)
  }
  const server = app.listen(config.port, () => console.log(`GPEC enquiry API listening on http://localhost:${config.port} (database: ${databaseName})`))
  // Docker stops a container with SIGTERM. Node running as the container's main process ignores it
  // unless handled, so Docker would wait 10 seconds and kill the API mid-request on every redeploy.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      console.log(`${signal} received; finishing open requests and shutting down.`)
      server.close(() => {
        mongoose.disconnect().finally(() => process.exit(0))
      })
    })
  }
} catch (error) {
  console.error('MongoDB connection failed.', error instanceof Error ? error.message : error)
  process.exit(1)
}
