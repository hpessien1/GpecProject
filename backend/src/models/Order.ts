import mongoose from 'mongoose'

// Payment status is set only by the server once Paystack confirms a payment (CLAUDE.md Section 4.1);
// admins never change it. pending_payment: created, not paid (or abandoned). failed: Paystack
// reported a failed payment.
export const PAYMENT_STATUSES = ['pending_payment', 'paid', 'failed'] as const
export type PaymentStatus = typeof PAYMENT_STATUSES[number]

// Fulfilment of a paid order, moved along by GPEC staff. "ready_for_pickup" applies to pickup orders
// and "out_for_delivery" to delivery orders. Every change is recorded (AuditRecord).
export const FULFILMENT_STATUSES = ['new', 'processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled'] as const
export type FulfilmentStatus = typeof FULFILMENT_STATUSES[number]

export const FULFILMENT_METHODS = ['pickup', 'delivery'] as const

const wholeNumber = { validator: (value: number) => Number.isInteger(value), message: '{PATH} must be a whole number.' }
// Money: whole numbers of the currency's smallest unit (kobo for NGN), like product prices.
const money = { type: Number, required: true, min: 0, validate: wholeNumber }

// Each line copies the product's name, code, and price at the time of the order, so a later change to
// the product never changes a past order (CLAUDE.md Section 5).
const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  reference: { type: String, required: true, trim: true },
  unitPrice: money,
  quantity: { type: Number, required: true, min: 1, max: 1000, validate: wholeNumber },
  lineTotal: money,
}, { _id: false })

// The MongoDB _id is also the Paystack transaction reference; `reference` is what the customer sees.
const orderSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },
  customer: {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 120, default: '' },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
  },
  items: { type: [orderItemSchema], required: true, validate: [(items: unknown[]) => items.length > 0, 'At least one product is required.'] },
  fulfilmentMethod: { type: String, required: true, enum: FULFILMENT_METHODS },
  // Only for delivery orders; pickup orders never collect an address (Product Principle 5).
  deliveryAddress: { type: String, trim: true, maxlength: 500, default: '' },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  subtotal: money,
  deliveryFee: money,
  paystackFee: money,
  total: money,
  paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending_payment' },
  paidAt: { type: Date, default: null },
  fulfilmentStatus: { type: String, enum: FULFILMENT_STATUSES, default: 'new' },
}, { timestamps: true, strict: 'throw' })

// The admin list filters by payment and fulfilment status and shows newest first.
orderSchema.index({ paymentStatus: 1, fulfilmentStatus: 1, createdAt: -1 })
orderSchema.index({ createdAt: -1 })

export default mongoose.model('Order', orderSchema)
