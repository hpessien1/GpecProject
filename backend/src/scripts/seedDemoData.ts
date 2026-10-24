// Adds demo orders, contact requests, and delivery areas, prices the sample products, and switches
// bank transfer on with the sample details, so GPEC can see everything working (run
// `npm run seed:products` first, so the sample products exist). Refuses the production "gpec"
// database unless --production is given; demo data there must be removed before launch.
//
//   npm run seed:demo                (add the demo records that are missing)
//   npm run seed:demo -- --remove    (remove every demo record, with its history and notes)
//   node dist/scripts/seedDemoData.js --production [--remove]   (live site, from Coolify's terminal)
import 'dotenv/config'
import mongoose from 'mongoose'
import { loadConfig } from '../config.js'
import { assertDemoAllowed, removeDemoData, seedDemoData } from '../services/demoData.js'
import { s3ImageStore } from '../services/imageStore.js'

try {
  const config = loadConfig()
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
  const databaseName = mongoose.connection.name
  assertDemoAllowed(databaseName, config.nodeEnv, process.argv.includes('--production'))
  if (process.argv.includes('--remove')) {
    const { orders, contactRequests, deliveryAreas } = await removeDemoData()
    console.log(`Database "${databaseName}": removed ${orders} demo orders, ${contactRequests} demo contact requests, and ${deliveryAreas} demo delivery areas; bank transfer is off unless real bank details were entered.`)
    // The storage key can add and read files but not delete them (RUNBOOK 1.7).
    if (config.imageStorage) console.log('Sample files attached to demo requests stay in file storage, unlisted (a few kB each).')
  } else {
    const store = config.imageStorage ? s3ImageStore(config.imageStorage) : null
    const { orders, contactRequests, files, withHistory, deliveryAreas, bankTransferOn, pricesSet } = await seedDemoData(Date.now(), store)
    console.log(`Database "${databaseName}": added ${orders} demo orders, ${contactRequests} demo contact requests, and ${deliveryAreas} demo delivery areas, and priced ${pricesSet} sample products (the rest were already there).`)
    if (contactRequests > 0) console.log(store ? `Attached ${files} sample files to the new demo contact requests.` : 'File storage (S3_*) is not set up, so the demo contact requests have no attached files.')
    console.log(bankTransferOn ? 'Bank transfer is on, with the sample bank details (customers are told not to send money).' : 'Bank transfer left as it is: real bank details have been entered.')
    if (!withHistory) console.log('No admin account exists, so no status history or notes were added. Create one (npm run admin:create), remove the demo data, and run this again to include them.')
  }
  await mongoose.disconnect()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await mongoose.disconnect()
  process.exit(1)
}
