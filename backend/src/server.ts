import 'dotenv/config'
import mongoose from 'mongoose'
import createApp from './app.js'

// Production must use the gpec database. Anything else (gpec_dev, or Atlas's default "test" when the
// URI has no database name) means MONGODB_URI is wrong, and the app would otherwise connect silently.
const PRODUCTION_DATABASE = 'gpec'

const port = Number(process.env.PORT || 5001)
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gpec'
const isProduction = process.env.NODE_ENV === 'production'
const app = createApp()

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
  const databaseName = mongoose.connection.name
  if (isProduction && databaseName !== PRODUCTION_DATABASE) {
    console.error(`Refusing to start: production must use the "${PRODUCTION_DATABASE}" database, but MONGODB_URI points to "${databaseName}". Fix MONGODB_URI in Coolify.`)
    await mongoose.disconnect()
    process.exit(1)
  }
  app.listen(port, () => console.log(`GPEC enquiry API listening on http://localhost:${port} (database: ${databaseName})`))
} catch (error) {
  console.error('MongoDB connection failed.', error instanceof Error ? error.message : error)
  process.exit(1)
}
