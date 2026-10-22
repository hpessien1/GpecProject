import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import PasswordInput from './PasswordInput'
import { ApiError } from '../../services/apiClient'
import { changePassword } from '../../services/adminApi'

// Matches the server's rule (validation/adminSession.ts); the server checks again.
const MIN_PASSWORD_LENGTH = 15

interface AdminPasswordFormProps {
  onSessionEnded: () => void
}

export default function AdminPasswordForm({ onSessionEnded }: AdminPasswordFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newPasswordLength, setNewPasswordLength] = useState(0)
  const resultRef = useRef<HTMLParagraphElement>(null)

  // The button is disabled while saving, which drops keyboard focus; move it to the result instead.
  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const form = event.currentTarget
    const formData = new FormData(form)
    const currentPassword = String(formData.get('currentPassword') ?? '')
    const newPassword = String(formData.get('newPassword') ?? '')
    const fieldErrors: Record<string, string> = {}
    if (newPassword.length < MIN_PASSWORD_LENGTH) fieldErrors.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words make a strong, memorable password.`
    else if (newPassword !== String(formData.get('confirmPassword') ?? '')) fieldErrors.confirmPassword = 'The two new passwords do not match.'
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      setResult({ kind: 'error', message: 'Check the highlighted fields and try again.' })
      return
    }

    setIsSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      form.reset()
      setNewPasswordLength(0)
      setResult({ kind: 'success', message: 'Your password has been changed. Any other browsers where you were logged in have been logged out.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setErrors(error.errors)
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to change your password. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  const isLongEnough = newPasswordLength >= MIN_PASSWORD_LENGTH
  const describedBy = (name: string, hint = false) => [hint && `${name}-hint`, errors[name] && `${name}-error`].filter(Boolean).join(' ') || undefined
  return <section aria-labelledby="admin-password-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> Your account</p><h1 id="admin-password-title" tabIndex={-1}>Change password</h1></div>
      <a className="text-link" href="#admin">Back to products</a>
    </div>
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-field">
        <label htmlFor="currentPassword">Current password</label>
        <PasswordInput id="currentPassword" name="currentPassword" required autoComplete="current-password" aria-describedby={describedBy('currentPassword')} />
        {errors.currentPassword && <small className="admin-field-error" id="currentPassword-error">{errors.currentPassword}</small>}
      </div>
      <div className="admin-field">
        <label htmlFor="newPassword">New password</label>
        <PasswordInput id="newPassword" name="newPassword" required maxLength={200} autoComplete="new-password" aria-describedby={describedBy('newPassword', true)} onChange={(event) => setNewPasswordLength(event.target.value.length)} />
        {/* Shown as you type. Screen readers hear only the moment it becomes long enough, not every keystroke. */}
        {isLongEnough
          ? <small className="admin-password-count admin-password-count-ok" aria-hidden="true">{newPasswordLength} characters ✓ long enough</small>
          : <small className="admin-password-count" aria-hidden="true">{newPasswordLength} of {MIN_PASSWORD_LENGTH} characters</small>}
        <span className="visually-hidden" aria-live="polite">{isLongEnough ? 'The new password is long enough.' : ''}</span>
        <small id="newPassword-hint">At least {MIN_PASSWORD_LENGTH} characters. Length matters more than symbols: a few unrelated words, or a password manager, work well. Do not reuse a password from another site. Passwords known from data breaches are refused.</small>
        {errors.newPassword && <small className="admin-field-error" id="newPassword-error">{errors.newPassword}</small>}
      </div>
      <div className="admin-field">
        <label htmlFor="confirmPassword">New password again</label>
        <PasswordInput id="confirmPassword" name="confirmPassword" required autoComplete="new-password" aria-describedby={describedBy('confirmPassword')} />
        {errors.confirmPassword && <small className="admin-field-error" id="confirmPassword-error">{errors.confirmPassword}</small>}
      </div>
      <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Change password <Arrow /></>}</button>
    </form>
  </section>
}
