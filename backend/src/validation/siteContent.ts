import { SITE_CONTENT_KEYS, SITE_CONTENT_LIMITS } from '../models/SiteContent.js'
import type { SiteContentKey } from '../models/SiteContent.js'
import type { SiteContentSection } from '../data/siteContentDefaults.js'
import { asFields, text } from './fields.js'
import type { ValidationErrors } from './fields.js'

const EDITABLE_FIELDS = ['title', 'intro', 'sections', 'approved'] as const

export interface SiteContentChanges {
  title?: string
  intro?: string
  sections?: SiteContentSection[]
  approved?: boolean
}

export function isSiteContentKey(value: unknown): value is SiteContentKey {
  return typeof value === 'string' && (SITE_CONTENT_KEYS as readonly string[]).includes(value)
}

// Each field is checked only if present, with exact types. Sections are sent whole (the page's full
// list, in order), each with exactly a heading and a body.
export function validateSiteContentUpdate(body: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(body)
  const value: SiteContentChanges = {}
  const has = (field: string) => Object.hasOwn(source, field)
  for (const field of Object.keys(source)) if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) errors[field] = `${field} is not an editable field.`
  if (Object.keys(source).length === 0) errors.body = 'Send at least one field to change.'

  if (has('title')) {
    if (typeof source.title !== 'string') errors.title = 'title must be text.'
    else value.title = text(source.title, SITE_CONTENT_LIMITS.title, 'title', errors, true)
  }
  if (has('intro')) {
    if (typeof source.intro !== 'string') errors.intro = 'intro must be text.'
    else value.intro = text(source.intro, SITE_CONTENT_LIMITS.intro, 'intro', errors)
  }
  if (has('approved')) {
    if (typeof source.approved === 'boolean') value.approved = source.approved
    else errors.approved = 'approved must be true or false.'
  }
  if (has('sections')) {
    const sections = source.sections
    if (!Array.isArray(sections)) errors.sections = 'sections must be a list.'
    else if (sections.length > SITE_CONTENT_LIMITS.sections) errors.sections = `A page can have at most ${SITE_CONTENT_LIMITS.sections} sections.`
    else {
      value.sections = sections.map((item, index) => {
        const section = asFields(item)
        const prefix = `sections.${index}`
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors[prefix] = 'Each section must have a heading and text.'
          return { heading: '', body: '' }
        }
        for (const field of Object.keys(section)) if (field !== 'heading' && field !== 'body') errors[`${prefix}.${field}`] = `${field} is not a section field.`
        const checked = {
          heading: text(section.heading, SITE_CONTENT_LIMITS.heading, `${prefix}.heading`, errors, true),
          body: text(section.body, SITE_CONTENT_LIMITS.body, `${prefix}.body`, errors, true),
        }
        // Anything but text is refused by name, not reported as empty.
        for (const field of ['heading', 'body'] as const) if (typeof section[field] !== 'string') errors[`${prefix}.${field}`] = `${field} must be text.`
        return checked
      })
    }
  }
  const total = (value.title?.length ?? 0) + (value.intro?.length ?? 0) + (value.sections ?? []).reduce((sum, section) => sum + section.heading.length + section.body.length, 0)
  if (total > SITE_CONTENT_LIMITS.total) errors.body = `A page can hold at most ${SITE_CONTENT_LIMITS.total.toLocaleString('en-GB')} characters.`
  return { errors, value }
}
