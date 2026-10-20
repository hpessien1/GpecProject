import 'dotenv/config'
import mongoose from 'mongoose'
import createApp from './app.js'

const port = Number(process.env.PORT || 5001)
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gpec'
const app = createApp()

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
  app.listen(port, () => console.log(`GPEC enquiry API listening on http://localhost:${port}`))
} catch (error) {
  console.error('MongoDB connection failed.', error instanceof Error ? error.message : error)
  process.exit(1)
}
