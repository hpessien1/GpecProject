import mongoose from 'mongoose'

// Who changed what, and when (CLAUDE.md Section 4.6). Written in the same transaction as the change
// it describes, and never edited or deleted by the application.
const changeSchema = new mongoose.Schema({
  field: { type: String, required: true },
  from: { type: mongoose.Schema.Types.Mixed, default: null },
  to: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false })

const auditRecordSchema = new mongoose.Schema({
  action: { type: String, required: true, enum: ['product.create', 'product.update', 'enquiry.status', 'contactRequest.status'] },
  targetType: { type: String, required: true, enum: ['product', 'enquiry', 'contactRequest'] },
  targetId: { type: String, required: true },
  // Copied at the time, so the record still names the person if the account changes later.
  actor: {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
  },
  changes: { type: [changeSchema], default: [] },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' })

auditRecordSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })

export default mongoose.model('AuditRecord', auditRecordSchema)
