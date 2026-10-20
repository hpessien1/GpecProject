import mongoose from 'mongoose'

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
  items: { type: [itemSchema], required: true, validate: [(items) => items.length > 0, 'At least one product is required.'] },
  status: { type: String, enum: ['new'], default: 'new' },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('Enquiry', enquirySchema)
