import mongoose from 'mongoose'

// A general enquiry from the landing-page contact form (no products attached).
const contactRequestSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  company: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  subject: { type: String, trim: true, maxlength: 60, default: '' },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  status: { type: String, enum: ['new'], default: 'new' },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('ContactRequest', contactRequestSchema)
