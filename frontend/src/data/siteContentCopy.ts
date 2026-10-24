// Fixed wording around the pages staff edit in the admin panel (the pages' own text comes from the API).
import type { SiteContentKey } from '../types'

export const draftNotice = 'Draft for GPEC’s review: not yet in effect. Highlighted items are still to be confirmed.'

// The public address of each page, and its eyebrow label.
export const siteContentPages: Record<SiteContentKey, { href: string, eyebrow: string }> = {
  privacy: { href: '#privacy', eyebrow: 'Your information' },
  refunds: { href: '#refunds', eyebrow: 'Buying from GPEC' },
  faq: { href: '#faq', eyebrow: 'Questions' },
}

export const siteContentStates = {
  loading: 'Loading…',
  empty: 'Nothing has been published here yet.',
}
