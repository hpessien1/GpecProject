import { getJson, postJson, requestJson } from './apiClient'
import type { ContactRequestOptions, ContactRequestPayload, ContactRequestResponse } from '../types'

const SEND_FAILED = 'Unable to send your inquiry. Please try again.'

// Whether the form can take attached files (they need GPEC's file storage to be set up).
export function fetchContactRequestOptions() {
  return getJson<ContactRequestOptions>('/contact-requests/options', 'Unable to load the form options.')
}

// As JSON, or, with attached files, as multipart form data with the same fields plus `files`.
export function submitContactRequest(payload: ContactRequestPayload, files: File[] = []) {
  if (files.length === 0) return postJson<ContactRequestResponse>('/contact-requests', payload, SEND_FAILED)
  const form = new FormData()
  for (const [name, value] of Object.entries(payload)) form.append(name, value)
  for (const file of files) form.append('files', file)
  return requestJson<ContactRequestResponse>('/contact-requests', SEND_FAILED, { method: 'POST', form })
}
