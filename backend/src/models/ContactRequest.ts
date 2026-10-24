import mongoose from 'mongoose'
import { STORED_REQUEST_FILE_TYPES } from '../services/requestFiles.js'
import { REQUEST_STATUSES } from './requestStatus.js'

// A photo or PDF the customer attached (services/requestFiles.ts). The file itself is in the private
// bucket under request-files/<id>; this is what staff see about it.
const attachmentSchema = new mongoose.Schema({
  id: { type: String, required: true, match: /^[0-9a-f]{32}$/ },
  name: { type: String, required: true, maxlength: 120 },
  contentType: { type: String, required: true, enum: STORED_REQUEST_FILE_TYPES },
  size: { type: Number, required: true, min: 0 },
}, { _id: false, strict: 'throw' })

// A question or quote request from the landing-page contact form (no products attached), with any
// photos or drawings the customer chose to add. Requests from before 2026-10-24 have no attachments
// field stored.
const contactRequestSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  company: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  subject: { type: String, trim: true, maxlength: 60, default: '' },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  attachments: { type: [attachmentSchema], default: [] },
  status: { type: String, enum: REQUEST_STATUSES, default: 'new' },
}, { timestamps: true, strict: 'throw' })

// The admin list filters by status and shows newest first.
contactRequestSchema.index({ status: 1, createdAt: -1 })
contactRequestSchema.index({ createdAt: -1 })

export default mongoose.model('ContactRequest', contactRequestSchema)
