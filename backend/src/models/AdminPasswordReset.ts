import mongoose from 'mongoose'

// One "forgot password" link. The email holds a random token; only its SHA-256 hash is stored, so a
// copy of the database cannot be used to reset a password. Deleted when used, when a newer link is
// asked for, or (by MongoDB) once it expires.
const adminPasswordResetSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('AdminPasswordReset', adminPasswordResetSchema)
