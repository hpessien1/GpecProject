import mongoose from 'mongoose'

// GPEC staff's internal notes on an order enquiry or contact request; customers never see them.
// Notes are only ever added, never edited or deleted, so each one is its own record of who wrote
// what and when (CLAUDE.md Section 4.6).
const requestNoteSchema = new mongoose.Schema({
  targetType: { type: String, required: true, enum: ['enquiry', 'contactRequest'] },
  // The request's customer-facing reference, as in AuditRecord.
  targetId: { type: String, required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  // Copied at the time, so the note still names the person if the account changes later.
  author: {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
  },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' })

requestNoteSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })

export default mongoose.model('RequestNote', requestNoteSchema)
