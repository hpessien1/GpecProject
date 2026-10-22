import { randomBytes } from 'node:crypto'

// Customer-facing reference, e.g. GPEC-C-2026-1A2B3C4D (contact requests, prefix GPEC-C).
export function createReference(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`
}
