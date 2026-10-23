import mongoose from 'mongoose'

// Payment status is set only by the server: for Paystack orders once Paystack confirms a payment
// (CLAUDE.md Section 4.1); for bank transfers when staff confirm the money arrived (or close the order
// as not received), through their own recorded actions. pending_payment: created, not paid (or
// abandoned). failed: Paystack reported a failed payment, or staff closed an unpaid transfer.
export const PAYMENT_STATUSES = ['pending_payment', 'paid', 'failed'] as const
export type PaymentStatus = typeof PAYMENT_STATUSES[number]

// Fulfilment of a paid order, moved along by GPEC staff. "ready_for_pickup" applies to pickup orders
// and "out_for_delivery" to delivery orders. Every change is recorded (AuditRecord).
export const FULFILMENT_STATUSES = ['new', 'processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled'] as const
export type FulfilmentStatus = typeof FULFILMENT_STATUSES[number]

export const FULFILMENT_METHODS = ['pickup', 'delivery'] as const

// paystack: paid on Paystack's page, confirmed by the server with Paystack. bank_transfer: the
// customer transfers to GPEC's account and GPEC staff confirm the money arrived.
export const PAYMENT_METHODS = ['paystack', 'bank_transfer'] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]

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

// The delivery area chosen at checkout, copied at the time (its fee is the order's deliveryFee), so a
// later change to the area never changes a past order.
const deliveryAreaSnapshotSchema = new mongoose.Schema({
  areaId: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
}, { _id: false })

// The bank details the customer was given, copied at the time, so the order shows what they were told
// even if GPEC's details change later.
const bankTransferSnapshotSchema = new mongoose.Schema({
  bankName: { type: String, required: true },
  accountName: { type: String, required: true },
  accountNumber: { type: String, required: true },
  instructions: { type: String, default: '' },
  payWithinDays: { type: Number, required: true },
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
  deliveryArea: { type: deliveryAreaSnapshotSchema, default: null },
  // Anything the customer added at checkout ("Additional requirements or notes").
  customerNotes: { type: String, trim: true, maxlength: 1000, default: '' },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  subtotal: money,
  deliveryFee: money,
  paystackFee: money,
  total: money,
  // Orders from before bank transfer existed were all Paystack orders.
  paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'paystack' },
  bankTransfer: { type: bankTransferSnapshotSchema, default: null },
  // When the customer pressed "I have sent the transfer". It proves nothing; staff still confirm.
  transferReportedAt: { type: Date, default: null },
  paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending_payment' },
  paidAt: { type: Date, default: null },
  fulfilmentStatus: { type: String, enum: FULFILMENT_STATUSES, default: 'new' },
}, { timestamps: true, strict: 'throw' })

// The admin list filters by payment and fulfilment status and shows newest first.
orderSchema.index({ paymentStatus: 1, fulfilmentStatus: 1, createdAt: -1 })
orderSchema.index({ createdAt: -1 })

export default mongoose.model('Order', orderSchema)
