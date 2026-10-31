// Says how many records the data clean-up would delete today. Reads only; deletes nothing.
//
//   npm run retention:preview
//   node dist/scripts/retentionPreview.js   (live site, from Coolify's terminal)
import 'dotenv/config'
import mongoose from 'mongoose'
import { loadConfig } from '../config.js'
import { previewCleanup, retentionCutoffs } from '../services/dataRetention.js'

try {
  const config = loadConfig()
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
  const preview = await previewCleanup(retentionCutoffs(new Date(), config.accountingYearEnd))
  console.log(`Database "${mongoose.connection.name}". The clean-up is ${config.retentionCleanup ? 'ON' : 'off'}. Due today:`)
  console.log(`  ${preview.contactRequests} contact requests (closed over 6 months ago; ${preview.kept} marked "keep" are left alone)`)
  console.log(`  ${preview.unpaidOrders} unpaid orders (unchanged for over 6 months)`)
  console.log(preview.paidOrders === null ? '  Paid orders: unknown until RETENTION_ACCOUNTING_YEAR_END is set' : `  ${preview.paidOrders} paid orders (over 6 accounting years old)`)
  console.log(`  ${preview.filesWaiting} files waiting to be removed from storage`)
  await mongoose.disconnect()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await mongoose.disconnect()
  process.exit(1)
}
