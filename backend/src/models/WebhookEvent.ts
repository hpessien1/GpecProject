import mongoose from 'mongoose'

// Each Paystack webhook delivery handled, so a repeated delivery (Paystack retries) is recognised and
// skipped (CLAUDE.md Section 4.1). Only what the code reads is kept, not the full payload.
const webhookEventSchema = new mongoose.Schema({
  // Paystack's events carry no event ID of their own; the event name and the transaction's ID together
  // identify one, e.g. "charge.success:4099260516".
  eventId: { type: String, required: true, unique: true, maxlength: 120 },
  event: { type: String, required: true, maxlength: 60 },
  // The transaction reference (the order's _id), when the event has one.
  reference: { type: String, default: '', maxlength: 100 },
  // What the site did with it: received (an order payment whose work has not finished yet; a repeated
  // delivery does it again), processed (it changed or confirmed an order), or ignored.
  outcome: { type: String, enum: ['received', 'processed', 'ignored'], required: true },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('WebhookEvent', webhookEventSchema)
