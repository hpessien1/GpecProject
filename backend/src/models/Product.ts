import mongoose from 'mongoose'

export const PRODUCT_STATUSES = ['active', 'archived'] as const

const productSchema = new mongoose.Schema({
  // The product's short key (e.g. "panel-001"), used in carts and enquiry items. Not the
  // customer-facing code, which is `reference`.
  _id: { type: String, required: true, trim: true, match: /^[a-z0-9-]{1,60}$/ },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  reference: { type: String, required: true, trim: true, maxlength: 40, unique: true },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  specs: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
  image: { type: String, required: true, trim: true, maxlength: 300 },
  alt: { type: String, required: true, trim: true, maxlength: 300 },
  // Integer in the currency's smallest unit (kobo if the currency is confirmed as NGN). Null until
  // GPEC sets a price; never shown or charged until then.
  price: { type: Number, default: null, min: 0, validate: { validator: (value: number | null) => value === null || Number.isInteger(value), message: 'price must be a whole number of the smallest currency unit.' } },
  // True for sample data that GPEC has not supplied or approved; the shop labels these.
  isPlaceholder: { type: Boolean, default: false },
  // Archived products disappear from the shop but stay in the database for past enquiries and orders.
  status: { type: String, enum: PRODUCT_STATUSES, default: 'active' },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true, strict: 'throw' })

productSchema.index({ status: 1, sortOrder: 1 })

export default mongoose.model('Product', productSchema)
