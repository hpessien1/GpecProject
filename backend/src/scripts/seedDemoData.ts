// Adds demo orders and contact requests to the development database, for showing the admin screens.
// Never runs against the production "gpec" database (there is no override).
//
//   npm run seed:demo                (add the demo records that are missing)
//   npm run seed:demo -- --remove    (remove every demo record, with its history and notes)
import 'dotenv/config'
import mongoose from 'mongoose'
import { loadConfig } from '../config.js'
import { assertDemoAllowed, removeDemoData, seedDemoData } from '../services/demoData.js'

try {
  const config = loadConfig()
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
  const databaseName = mongoose.connection.name
  assertDemoAllowed(databaseName, config.nodeEnv)
  if (process.argv.includes('--remove')) {
    const { orders, contactRequests } = await removeDemoData()
    console.log(`Database "${databaseName}": removed ${orders} demo orders and ${contactRequests} demo contact requests.`)
  } else {
    const { orders, contactRequests, withHistory } = await seedDemoData()
    console.log(`Database "${databaseName}": added ${orders} demo orders and ${contactRequests} demo contact requests (the rest were already there).`)
    if (!withHistory) console.log('No admin account exists, so no status history or notes were added. Create one (npm run admin:create), remove the demo data, and run this again to include them.')
  }
  await mongoose.disconnect()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await mongoose.disconnect()
  process.exit(1)
}
