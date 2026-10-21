const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'

// Carries what the server said, so screens can show field messages or react to a specific code
// (for example ADMIN_AUTH_REQUIRED when an admin session has ended).
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly errors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  payload?: unknown
  // Admin requests send the session cookie; public requests never do.
  withCredentials?: boolean
}

// All requests to the GPEC API go through here.
export async function requestJson<T>(path: string, fallbackMessage: string, { method = 'GET', payload, withCredentials = false }: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      credentials: withCredentials ? 'include' : 'same-origin',
    })
  } catch {
    // Network failure (offline, server down): the browser's own message ("Failed to fetch") means nothing to customers.
    throw new ApiError(`${fallbackMessage} If the problem continues, please contact GPEC directly.`, 0)
  }
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(body.message || fallbackMessage, response.status, body.code, body.errors)
  return body
}

export function getJson<T>(path: string, fallbackMessage: string): Promise<T> {
  return requestJson<T>(path, fallbackMessage)
}

export function postJson<T>(path: string, payload: unknown, fallbackMessage: string): Promise<T> {
  return requestJson<T>(path, fallbackMessage, { method: 'POST', payload })
}
