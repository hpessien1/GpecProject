import { postJson } from './apiClient'
import type { EnquiryPayload, EnquiryResponse } from '../types'

export function submitOrderEnquiry(payload: EnquiryPayload) {
  return postJson<EnquiryResponse>('/enquiries', payload, 'Unable to submit enquiry. Please try again.')
}
