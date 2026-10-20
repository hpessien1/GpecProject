import { postJson } from './apiClient'
import type { ContactRequestPayload, ContactRequestResponse } from '../types'

export function submitContactRequest(payload: ContactRequestPayload) {
  return postJson<ContactRequestResponse>('/contact-requests', payload, 'Unable to send your inquiry. Please try again.')
}
