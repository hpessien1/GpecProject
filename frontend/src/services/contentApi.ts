import { getJson } from './apiClient'
import type { SiteContentKey, SiteContentPage } from '../types'

// The privacy notice, the refunds policy, or the FAQ, as GPEC's staff last saved it.
export function getSiteContent(key: SiteContentKey) {
  return getJson<SiteContentPage>(`/content/${key}`, 'Unable to load this page.')
}
