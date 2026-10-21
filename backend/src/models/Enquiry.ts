import mongoose from 'mongoose'
import { REQUEST_STATUSES } from './requestStatus.js'

const itemSchema = new mongoose.Schema({
  productId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  reference: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1, max: 1000 },
}, { _id: false })

const enquirySchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  customer: {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 120, default: '' },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
  },
  location: { type: String, trim: true, maxlength: 180, default: '' },
  notes: { type: String, trim: true, maxlength: 5000, default: '' },
  items: { type: [itemSchema], required: true, validate: [(items: unknown[]) => items.length > 0, 'At least one product is required.'] },
  status: { type: String, enum: REQUEST_STATUSES, default: 'new' },
}, { timestamps: true, strict: 'throw' })

// The admin list filters by status and shows newest first.
enquirySchema.index({ status: 1, createdAt: -1 })
enquirySchema.index({ createdAt: -1 })

export default mongoose.model('Enquiry', enquirySchema)
