import mongoose from 'mongoose'

// A completed Paystack payment the website could not match to an order: no such order, or its amount
// or currency differs. Saved so that it cannot be lost, emailed to staff, and listed on the admin
// Orders screen until staff mark it dealt with (services/unmatchedPayments.ts). Holds what Paystack's
// message said about the payment and no customer details.
const unmatchedPaymentSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },
  reason: { type: String, required: true, enum: ['no_order', 'mismatch'] },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  // The last try at emailing staff, and when one succeeded.
  emailTriedAt: { type: Date, default: null },
  emailedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' })

unmatchedPaymentSchema.index({ resolvedAt: 1, createdAt: 1 })

export default mongoose.model('UnmatchedPayment', unmatchedPaymentSchema)
