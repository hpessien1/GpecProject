import type { EnquiryPayload, EnquiryResponse } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

export async function submitOrderEnquiry(payload: EnquiryPayload): Promise<EnquiryResponse> {
  const response = await fetch(`${apiBaseUrl}/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || 'Unable to submit enquiry. Please try again.')
  return body
}
