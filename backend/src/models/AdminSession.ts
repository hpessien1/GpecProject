import mongoose from 'mongoose'

// One logged-in browser. The cookie holds a random token; only its SHA-256 hash is stored, so a copy
// of the database cannot be used to log in.
const adminSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  // MongoDB deletes the session automatically once this time has passed.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  // The admin's credentialVersion when the password was checked: refused once the password changes.
  // Missing on sessions started before 2026-10-26: read as 0.
  credentialVersion: { type: Number, default: 0 },
  // The admin closed the "turn on two-step login" banner: it stays closed until they next log in.
  twoFactorPromptDismissed: { type: Boolean, default: false },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('AdminSession', adminSessionSchema)
