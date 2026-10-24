import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import AdminLoginCode from './AdminLoginCode'
import PasswordInput from './PasswordInput'
import { logIn } from '../../services/adminApi'
import type { AdminSessionInfo, LoginChallenge } from '../../types'

interface AdminLoginProps {
  notice: string
  onLoggedIn: (session: AdminSessionInfo) => void
}

export default function AdminLogin({ notice, onLoggedIn }: AdminLoginProps) {
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  // Set when the password was right and two-step login needs the code next.
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)
  const [restartNotice, setRestartNotice] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)

  // The button is disabled while sending, which drops keyboard focus; move it to the error instead.
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  // Each step's heading takes focus, as a new screen would.
  useEffect(() => { document.querySelector<HTMLElement>('#admin-main h1')?.focus() }, [challenge])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setRestartNotice('')
    setIsSending(true)
    const formData = new FormData(event.currentTarget)
    try {
      const result = await logIn(String(formData.get('email') ?? ''), String(formData.get('password') ?? ''))
      if ('twoFactorRequired' in result) setChallenge(result)
      else onLoggedIn(result)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to log in. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  if (challenge) return <AdminLoginCode challenge={challenge} onLoggedIn={onLoggedIn} onRestart={(message) => { setChallenge(null); setRestartNotice(message) }} />

  return <section className="admin-login" aria-labelledby="admin-login-title">
    <p className="eyebrow"><span /> GPEC staff only</p>
    <h1 id="admin-login-title" tabIndex={-1}>Admin login</h1>
    {(restartNotice || notice) && <p className="admin-notice" role="status">{restartNotice || notice}</p>}
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
