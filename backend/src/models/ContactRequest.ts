import mongoose from 'mongoose'
import { REQUEST_STATUSES } from './requestStatus.js'

// A question or quote request from the landing-page contact form (no products attached).
const contactRequestSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  company: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  subject: { type: String, trim: true, maxlength: 60, default: '' },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  status: { type: String, enum: REQUEST_STATUSES, default: 'new' },
}, { timestamps: true, strict: 'throw' })

// The admin list filters by status and shows newest first.
contactRequestSchema.index({ status: 1, createdAt: -1 })
contactRequestSchema.index({ createdAt: -1 })

export default mongoose.model('ContactRequest', contactRequestSchema)
