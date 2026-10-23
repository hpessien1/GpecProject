import { useEffect, useRef, useState } from 'react'
import PasswordInput from './PasswordInput'
import { MIN_PASSWORD_LENGTH } from '../../utils/password'

interface NewPasswordFieldsProps {
  errors: Record<string, string>
}

// "New password" with a live length count, and "New password again". Used when changing a password
// and when setting one from a reset link. Field names: newPassword, confirmPassword.
export default function NewPasswordFields({ errors }: NewPasswordFieldsProps) {
  const [length, setLength] = useState(0)
  const fieldsRef = useRef<HTMLDivElement>(null)

  // The count starts again when the form is cleared after a successful change.
  useEffect(() => {
    const form = fieldsRef.current?.closest('form')
    if (!form) return
    const restart = () => setLength(0)
    form.addEventListener('reset', restart)
    return () => form.removeEventListener('reset', restart)
  }, [])

  const isLongEnough = length >= MIN_PASSWORD_LENGTH
  const describedBy = (name: string, hint = false) => [hint && `${name}-hint`, errors[name] && `${name}-error`].filter(Boolean).join(' ') || undefined
  return <div className="admin-new-password" ref={fieldsRef}>
    <div className="admin-field">
      <label htmlFor="newPassword">New password</label>
      <PasswordInput id="newPassword" name="newPassword" required maxLength={200} autoComplete="new-password" aria-describedby={describedBy('newPassword', true)} onChange={(event) => setLength(event.target.value.length)} />
      {/* Shown as you type. Screen readers hear only the moment it becomes long enough, not every keystroke. */}
      {isLongEnough
        ? <small className="admin-password-count admin-password-count-ok" aria-hidden="true">{length} characters ✓ long enough</small>
        : <small className="admin-password-count" aria-hidden="true">{length} of {MIN_PASSWORD_LENGTH} characters</small>}
      <span className="visually-hidden" aria-live="polite">{isLongEnough ? 'The new password is long enough.' : ''}</span>
      <small id="newPassword-hint">At least {MIN_PASSWORD_LENGTH} characters. Length matters more than symbols: a few unrelated words, or a password manager, work well. Do not reuse a password from another site. Passwords known from data breaches are refused.</small>
      {errors.newPassword && <small className="admin-field-error" id="newPassword-error">{errors.newPassword}</small>}
    </div>
    <div className="admin-field">
      <label htmlFor="confirmPassword">New password again</label>
      <PasswordInput id="confirmPassword" name="confirmPassword" required autoComplete="new-password" aria-describedby={describedBy('confirmPassword')} />
      {errors.confirmPassword && <small className="admin-field-error" id="confirmPassword-error">{errors.confirmPassword}</small>}
    </div>
  </div>
}
