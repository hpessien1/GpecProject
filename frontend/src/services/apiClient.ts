const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

// All requests to the GPEC API go through here.
async function requestJson<T>(path: string, init: RequestInit, fallbackMessage: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, init)
  } catch {
    // Network failure (offline, server down): the browser's own message ("Failed to fetch") means nothing to customers.
    throw new Error(`${fallbackMessage} If the problem continues, please contact GPEC directly.`)
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || fallbackMessage)
  return body
}

export function getJson<T>(path: string, fallbackMessage: string): Promise<T> {
  return requestJson<T>(path, {}, fallbackMessage)
}

export function postJson<T>(path: string, payload: unknown, fallbackMessage: string): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, fallbackMessage)
}
