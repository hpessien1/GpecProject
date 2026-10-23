import mongoose from 'mongoose'

export const DELIVERY_AREA_STATUSES = ['active', 'archived'] as const

// A place GPEC delivers to, with its fee, managed by staff in the admin panel (every change recorded).
// Customers choosing delivery pick one at checkout; the server takes the fee from here, never from the
// browser. Archived areas leave the checkout but stay for past orders, which keep their own copy.
const deliveryAreaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
  // Optional detail shown to customers, e.g. the districts or towns the area covers.
  description: { type: String, trim: true, maxlength: 300, default: '' },
  // Whole number of the currency's smallest unit (kobo), like product prices. 0 is free delivery.
  fee: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'fee must be a whole number of the smallest currency unit.' } },
  status: { type: String, enum: DELIVERY_AREA_STATUSES, default: 'active' },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true, strict: 'throw' })

deliveryAreaSchema.index({ status: 1, sortOrder: 1 })

export default mongoose.model('DeliveryArea', deliveryAreaSchema)
