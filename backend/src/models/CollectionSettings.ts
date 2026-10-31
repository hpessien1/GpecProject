import mongoose from 'mongoose'

// The one record of pickup settings, managed by staff in the admin panel (#admin/delivery). Created on
// the first save; until then services/collectionHours.ts uses GPEC's stated hours. Its _id is always
// COLLECTION_SETTINGS_ID.
export const COLLECTION_SETTINGS_ID = 'collection'

const collectionSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: COLLECTION_SETTINGS_ID, enum: [COLLECTION_SETTINGS_ID] },
  // Shown to customers as written, at checkout, on the order page, and in their emails.
  hours: { type: String, required: true, trim: true, maxlength: 120 },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('CollectionSettings', collectionSettingsSchema)
