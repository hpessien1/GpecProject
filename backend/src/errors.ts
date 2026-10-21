// Errors that map to a specific HTTP response in app.ts's error handler. `code` is a stable value the
// frontend can check to show a specific message (CLAUDE.md Section 6.4).
export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly errors?: Record<string, string>) {
    super(message)
    this.name = 'HttpError'
  }
}

export class ValidationError extends HttpError {
  constructor(errors: Record<string, string>, message = 'Check the details and try again.') {
    super(400, message, 'VALIDATION_ERROR', errors)
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message, 'NOT_FOUND')
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, message, code)
  }
}

// MongoDB's duplicate-key error (a unique index such as product reference or admin email).
export function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}
