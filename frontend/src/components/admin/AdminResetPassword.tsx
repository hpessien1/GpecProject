import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import NewPasswordFields from './NewPasswordFields'
import { ApiError } from '../../services/apiClient'
import { resetPassword } from '../../services/adminApi'
import { newPasswordErrors } from '../../utils/password'

interface AdminResetPasswordProps {
  // From the emailed link (#admin/reset-password/<token>); empty if the link was cut short.
  token: string
  onPasswordReset: () => void
}

// Sets a new password from an emailed reset link.
export default function AdminResetPassword({ token, onPasswordReset }: AdminResetPasswordProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ message: string, linkInvalid: boolean } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const resultRef = useRef<HTMLDivElement>(null)

  // The link works like a password until it is used, so take it out of the address bar and the
  // browser history straight away. The token stays in this screen.
  useEffect(() => { if (token) window.history.replaceState(null, '', '#admin/reset-password') }, [token])

  // The button is disabled while saving, which drops keyboard focus; move it to the result instead.
  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const formData = new FormData(event.currentTarget)
    const fieldErrors = newPasswordErrors(formData)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      setResult({ message: 'Check the highlighted fields and try again.', linkInvalid: false })
      return
    }

    setIsSaving(true)
    try {
      await resetPassword(token, String(formData.get('newPassword') ?? ''))
      onPasswordReset()
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors)
      setResult({
        message: error instanceof Error ? error.message : 'Unable to set your new password. Please try again.',
        linkInvalid: error instanceof ApiError && error.code === 'RESET_LINK_INVALID',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return <section className="admin-login" aria-labelledby="admin-reset-title">
    <p className="eyebrow"><span /> GPEC staff only</p>
    <h1 id="admin-reset-title" tabIndex={-1}>Choose a new password</h1>
    {!token
      ? <p className="form-error" role="alert">This reset link is incomplete. Copy the whole link from the email, or <a className="text-link" href="#admin/forgot-password">ask for a new one</a>.</p>
      : <>
        <p className="admin-help">Saving your new password logs you out on every device. Then log in with the new password.</p>
        {result && <div className="form-error" role="alert" tabIndex={-1} ref={resultRef}>
          {result.linkInvalid
            ? <>This reset link has expired, has already been used, or is incomplete. <a className="text-link" href="#admin/forgot-password">Ask for a new one</a>.</>
            : result.message}
        </div>}
        <form className="admin-form" onSubmit={handleSubmit}>
          <NewPasswordFields errors={errors} />
          <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Save new password <Arrow /></>}</button>
        </form>
      </>}
    <p className="admin-help"><a className="text-link" href="#admin">Back to login</a></p>
  </section>
}
