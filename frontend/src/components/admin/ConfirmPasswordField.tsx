import PasswordInput from './PasswordInput'

interface ConfirmPasswordFieldProps {
  id: string
  error?: string
  hint?: string
}

// The admin's current password, asked again for changes a browser left logged in must not make on its
// own: two-step login, GPEC's bank details, the reply-to address, and confirming a transfer arrived.
export default function ConfirmPasswordField({ id, error, hint }: ConfirmPasswordFieldProps) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ')
  return <div className="admin-field">
    <label htmlFor={id}>Password</label>
    <PasswordInput id={id} name="password" required autoComplete="current-password" aria-describedby={describedBy || undefined} />
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    {error && <small className="admin-field-error" id={`${id}-error`}>{error}</small>}
  </div>
}
