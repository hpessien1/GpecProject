import mongoose from 'mongoose'

// A customer's file still to be removed from the bucket, saved in the same transaction that deletes
// its contact request (services/dataRetention.ts), so a crash or a storage outage cannot leave a file
// behind with nothing pointing to it. Holds the file's random key only.
const pendingFileDeletionSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' })

export default mongoose.model('PendingFileDeletion', pendingFileDeletionSchema)
