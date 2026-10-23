import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import NewPasswordFields from './NewPasswordFields'
import PasswordInput from './PasswordInput'
import { ApiError } from '../../services/apiClient'
import { changePassword } from '../../services/adminApi'
import { newPasswordErrors } from '../../utils/password'

interface AdminPasswordFormProps {
  onSessionEnded: () => void
}

export default function AdminPasswordForm({ onSessionEnded }: AdminPasswordFormProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
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
    const fieldErrors = newPasswordErrors(formData)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      setResult({ kind: 'error', message: 'Check the highlighted fields and try again.' })
      return
    }

    setIsSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      form.reset()
      setResult({ kind: 'success', message: 'Your password has been changed. Any other browsers where you were logged in have been logged out.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setErrors(error.errors)
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to change your password. Please try again.' })
    } finally {
      setIsSaving(false)
    }
  }

  const describedBy = (name: string) => errors[name] ? `${name}-error` : undefined
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
      <NewPasswordFields errors={errors} />
      <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Change password <Arrow /></>}</button>
    </form>
  </section>
}
