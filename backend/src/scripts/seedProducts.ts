// Adds the sample products to the database named in MONGODB_URI. Safe to run more than once: products
// that already exist are left as they are.
//
//   npm run seed:products                          (development, gpec_dev)
//   node dist/scripts/seedProducts.js --production (production image, only with the owner's go-ahead)
import 'dotenv/config'
import mongoose from 'mongoose'
import { loadConfig } from '../config.js'
import { seedSampleProducts } from '../services/products.js'

const PRODUCTION_DATABASE = 'gpec'

try {
  const config = loadConfig()
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
  const databaseName = mongoose.connection.name
  // Writing to the live database must be a deliberate choice, never the result of a wrong .env.
  if (databaseName === PRODUCTION_DATABASE && !process.argv.includes('--production')) {
    throw new Error(`Refusing to seed the production "${PRODUCTION_DATABASE}" database without --production.`)
  }
  const { added, alreadyPresent, categorised } = await seedSampleProducts()
  console.log(`Database "${databaseName}": added ${added} sample products; ${alreadyPresent} were already present and left unchanged${categorised > 0 ? `, except that ${categorised} without a category got their sample category` : ''}.`)
  await mongoose.disconnect()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await mongoose.disconnect()
  process.exit(1)
}
