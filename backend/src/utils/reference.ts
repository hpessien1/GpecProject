import { randomBytes } from 'node:crypto'

// Customer-facing reference, e.g. GPEC-2026-1A2B3C4D (order enquiries) or GPEC-C-2026-1A2B3C4D (contact requests).
export function createReference(prefix = 'GPEC') {
  return `${prefix}-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`
}
