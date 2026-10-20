// Shared helpers for validating untrusted request bodies: read fields as unknown and narrow each one.
export type Fields = Record<string, unknown>
export type ValidationErrors = Record<string, string>

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function asFields(value: unknown): Fields {
  return (value && typeof value === 'object' ? value : {}) as Fields
}

// Only a string survives; anything else (numbers, objects such as { $gt: '' }) becomes ''.
export function text(value: unknown, maxLength: number, field: string, errors: ValidationErrors, required = false) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (required && !normalized) errors[field] = `${field} is required.`
  if (normalized.length > maxLength) errors[field] = `${field} must be ${maxLength} characters or fewer.`
  return normalized
}
