import { parseCursor } from '../utils/paging.js'
import type { Cursor } from '../utils/paging.js'
import { asFields } from './fields.js'
import type { ValidationErrors } from './fields.js'

// ?before=<cursor> for the next, older page of a history or notes list (utils/paging.ts); without
// it, the newest page. Unknown query parameters are ignored.
export function validateOlderPageQuery(query: unknown) {
  const errors: ValidationErrors = {}
  const source = asFields(query)
  let before: Cursor | null = null
  if (source.before !== undefined) {
    before = typeof source.before === 'string' ? parseCursor(source.before) : null
    if (!before) errors.before = 'before must be the cursor from an earlier page.'
  }
  return { errors, value: { before } }
}
