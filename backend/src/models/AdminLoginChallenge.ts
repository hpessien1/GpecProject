import mongoose from 'mongoose'

// A login halfway done: the password was right and the admin uses two-step login, so the code (or a
// recovery code) is still needed. Its own cookie holds a random token; only the SHA-256 is stored.
// Short-lived, and refused after a few wrong codes (services/twoFactor.ts).
const adminLoginChallengeSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  attempts: { type: Number, default: 0 },
  // Email codes: the SHA-256 of the code last sent, when, and how many were sent for this login.
  emailCodeHash: { type: String, default: null },
  emailCodeSentAt: { type: Date, default: null },
  emailCodesSent: { type: Number, default: 0 },
  // MongoDB deletes the challenge automatically once this time has passed.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('AdminLoginChallenge', adminLoginChallengeSchema)
