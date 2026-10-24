import mongoose from 'mongoose'

// Site text that GPEC's staff edit in the admin panel (#admin/content) instead of a developer: the
// privacy notice, the refunds policy, and the FAQ. One record per page, keyed by the page, created on
// the first save; until then services/siteContent.ts serves the text in data/siteContentDefaults.ts.
export const SITE_CONTENT_KEYS = ['privacy', 'refunds', 'faq'] as const
export type SiteContentKey = typeof SITE_CONTENT_KEYS[number]

// Limits shared with the validator (validation/siteContent.ts).
export const SITE_CONTENT_LIMITS = { title: 120, intro: 1000, heading: 200, body: 4000, sections: 60, total: 60_000 }

const sectionSchema = new mongoose.Schema({
  // A section heading, or for the FAQ a question.
  heading: { type: String, required: true, trim: true, maxlength: SITE_CONTENT_LIMITS.heading },
  // Plain text: a blank line starts a paragraph, "- " starts a bullet, [brackets] mark a placeholder.
  body: { type: String, required: true, trim: true, maxlength: SITE_CONTENT_LIMITS.body },
}, { _id: false, strict: 'throw' })

const siteContentSchema = new mongoose.Schema({
  _id: { type: String, enum: SITE_CONTENT_KEYS },
  title: { type: String, required: true, trim: true, maxlength: SITE_CONTENT_LIMITS.title },
  intro: { type: String, trim: true, maxlength: SITE_CONTENT_LIMITS.intro, default: '' },
  sections: { type: [sectionSchema], default: [] },
  // Off: the public page shows "Draft for GPEC's review". An admin turns it on once GPEC (and, for the
  // policies, its legal adviser) has approved the wording.
  approved: { type: Boolean, default: false },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('SiteContent', siteContentSchema)
