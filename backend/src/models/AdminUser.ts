import mongoose from 'mongoose'

// GPEC staff who manage the shop. Created only with scripts/createAdmin.ts; there is no sign-up.
const adminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  // scrypt hash with its own salt and cost settings (services/passwords.ts); never the password.
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin'], default: 'admin' },
  // Deactivated admins cannot log in and their sessions stop working.
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null },
  // Set when the admin changes their own password in the admin panel.
  passwordChangedAt: { type: Date, default: null },

  // Two-step login (services/twoFactor.ts), optional, turned on by each admin for their own account:
  // a code from an authenticator app, or one emailed at each login. null: off.
  twoFactorMethod: { type: String, enum: ['app', 'email', null], default: null },
  // The authenticator app's secret, encrypted with TWO_FACTOR_ENCRYPTION_KEY (services/secretBox.ts).
  twoFactorSecret: { type: String, default: null },
  twoFactorEnabledAt: { type: Date, default: null },
  // The time step of the last app code accepted: the same code cannot be used twice.
  lastTotpStep: { type: Number, default: null },
  // SHA-256 of each unused recovery code; a code is removed when used.
  recoveryCodeHashes: { type: [String], default: [] },
  // An authenticator app being set up: its secret (encrypted) until the admin confirms a first code.
  pendingTwoFactorSecret: { type: String, default: null },
  pendingTwoFactorExpiresAt: { type: Date, default: null },
  // A code emailed to the logged-in admin, to set up email codes or to confirm turning two-step login
  // off or making new recovery codes. Only its SHA-256 is kept.
  accountCodeHash: { type: String, default: null },
  accountCodeExpiresAt: { type: Date, default: null },
  accountCodeAttempts: { type: Number, default: 0 },
  accountCodeSentAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('AdminUser', adminUserSchema)
