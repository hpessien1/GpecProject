import mongoose from 'mongoose'

// Who changed what, and when (CLAUDE.md Section 4.6). Written in the same transaction as the change
// it describes, and never edited or deleted by the application.
const changeSchema = new mongoose.Schema({
  field: { type: String, required: true },
  from: { type: mongoose.Schema.Types.Mixed, default: null },
  to: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false })

const actorSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
}, { _id: false })

const auditRecordSchema = new mongoose.Schema({
  // product.sale: a paid order reduced a product's stock count (made by the website, not an admin).
  // order.payment: staff confirmed a bank transfer arrived, or closed an unpaid one; or staff asked
  // Paystack about a payment and Paystack's answer changed the order.
  action: { type: String, required: true, enum: ['product.create', 'product.update', 'product.sale', 'contactRequest.status', 'order.status', 'order.payment', 'deliveryArea.create', 'deliveryArea.update', 'bankTransfer.update', 'siteContent.update', 'customerEmail.update'] },
  targetType: { type: String, required: true, enum: ['product', 'contactRequest', 'order', 'deliveryArea', 'bankTransfer', 'siteContent', 'customerEmail'] },
  targetId: { type: String, required: true },
  // The admin who made the change, copied at the time, so the record still names the person if the
  // account changes later. Absent only for product.sale, which names the order instead.
  actor: { type: actorSchema, default: null, required: function (this: { action?: string }) { return this.action !== 'product.sale' } },
  orderReference: { type: String, default: null },
  changes: { type: [changeSchema], default: [] },
  // order.status and order.payment: true when staff chose to tell the customer by email (the email
  // goes out after the change is saved). Absent on older records and when no email was asked for.
  customerEmailed: { type: Boolean },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' })

auditRecordSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })

export default mongoose.model('AuditRecord', auditRecordSchema)
