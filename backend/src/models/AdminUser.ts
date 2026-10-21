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
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('AdminUser', adminUserSchema)
