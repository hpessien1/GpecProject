import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import PasswordInput from './PasswordInput'
import { logIn } from '../../services/adminApi'
import type { AdminSessionInfo } from '../../types'

interface AdminLoginProps {
  notice: string
  onLoggedIn: (session: AdminSessionInfo) => void
}

export default function AdminLogin({ notice, onLoggedIn }: AdminLoginProps) {
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)

  // The button is disabled while sending, which drops keyboard focus; move it to the error instead.
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSending(true)
    const formData = new FormData(event.currentTarget)
    try {
      onLoggedIn(await logIn(String(formData.get('email') ?? ''), String(formData.get('password') ?? '')))
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to log in. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  return <section className="admin-login" aria-labelledby="admin-login-title">
    <p className="eyebrow"><span /> GPEC staff only</p>
    <h1 id="admin-login-title" tabIndex={-1}>Admin login</h1>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <form className="admin-form" onSubmit={handleSubmit}>
      <label>Email address<input name="email" type="email" required autoComplete="username" /></label>
      <div className="admin-field">
        <label htmlFor="login-password">Password</label>
        <PasswordInput id="login-password" name="password" required autoComplete="current-password" />
      </div>
      {error && <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      <button className="button button-primary" type="submit" disabled={isSending}>{isSending ? 'Logging in…' : <>Log in <Arrow /></>}</button>
    </form>
    <p className="admin-help"><a className="text-link" href="#admin/forgot-password">Forgot your password?</a></p>
    <p className="admin-help">Accounts are created by the site administrator.</p>
  </section>
}
