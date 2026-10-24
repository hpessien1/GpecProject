import mongoose from 'mongoose'

// The one record of settings for the emails customers receive, managed by staff in the admin panel
// (#admin/emails). Every change is recorded and emailed to all admins: a quietly changed reply-to
// address would send customers' replies, such as proof of payment, to someone else. Created on the
// first save; until then services/customerEmail.ts uses GPEC's published address. Its _id is always
// CUSTOMER_EMAIL_SETTINGS_ID.
export const CUSTOMER_EMAIL_SETTINGS_ID = 'customer-email'

const customerEmailSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: CUSTOMER_EMAIL_SETTINGS_ID, enum: [CUSTOMER_EMAIL_SETTINGS_ID] },
  // Where customers' replies to their confirmation emails go.
  replyTo: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('CustomerEmailSettings', customerEmailSettingsSchema)
