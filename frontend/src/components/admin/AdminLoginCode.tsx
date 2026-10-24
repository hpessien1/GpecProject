import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import SecondStepFields, { readSecondStep } from './SecondStepFields'
import { twoFactorContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { resendLoginCode, submitLoginCode } from '../../services/adminApi'
import type { AdminSessionInfo, LoginChallenge } from '../../types'

interface AdminLoginCodeProps {
  challenge: LoginChallenge
  onLoggedIn: (session: AdminSessionInfo) => void
  // Back to the email and password, with a message (the login timed out, or too many wrong codes).
  onRestart: (message: string) => void
}

// The second step of a login with two-step login on: the code from the app or the email, or a
// recovery code instead.
export default function AdminLoginCode({ challenge, onLoggedIn, onRestart }: AdminLoginCodeProps) {
  // Without email, an email-code admin can only use a recovery code.
  const [useRecovery, setUseRecovery] = useState(challenge.method === 'email' && !challenge.emailAvailable)
  const [isSending, setIsSending] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: 'error' | 'status', text: string } | null>(null)
  const messageRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => { if (message) messageRef.current?.focus() }, [message])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setErrors({})
    setIsSending(true)
    try {
      onLoggedIn(await submitLoginCode(readSecondStep(new FormData(event.currentTarget))))
    } catch (error) {
      if (error instanceof ApiError && error.code === 'LOGIN_EXPIRED') return onRestart(error.message)
      if (error instanceof ApiError) setErrors(error.errors)
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to check the code. Please try again.' })
    } finally {
      setIsSending(false)
    }
  }

  async function resend() {
    setMessage(null)
    setIsResending(true)
    try {
      setMessage({ kind: 'status', text: (await resendLoginCode()).message })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'LOGIN_EXPIRED') return onRestart(error.message)
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to send a new code.' })
    } finally {
      setIsResending(false)
    }
  }

  // Without email, say so whichever field is showing: it explains why a recovery code is needed.
  const help = challenge.method === 'email' && !challenge.emailAvailable ? twoFactorContent.loginHelp.emailUnavailable
    : useRecovery ? twoFactorContent.loginHelp.recovery
    : challenge.method === 'app' ? twoFactorContent.loginHelp.app
    : twoFactorContent.loginHelp.email(challenge.emailHint ?? 'your email address')

  return <section className="admin-login" aria-labelledby="admin-login-code-title">
    <p className="eyebrow"><span /> GPEC staff only</p>
    <h1 id="admin-login-code-title" tabIndex={-1}>Two-step login</h1>
    <p className="admin-intro" id="admin-login-code-help">{help}</p>
    <form className="admin-form" onSubmit={handleSubmit} aria-describedby="admin-login-code-help">
      <SecondStepFields idPrefix="login" useRecovery={useRecovery} onToggle={() => { setUseRecovery((current) => !current); setErrors({}) }} codeLabel="6-digit code" errors={errors} />
      {message && <p className={message.kind === 'error' ? 'form-error' : 'success-message'} role={message.kind === 'error' ? 'alert' : 'status'} tabIndex={-1} ref={messageRef}>{message.text}</p>}
      <button className="button button-primary" type="submit" disabled={isSending}>{isSending ? 'Checking…' : <>Log in <Arrow /></>}</button>
    </form>
    {challenge.method === 'email' && challenge.emailAvailable && !useRecovery && <p className="admin-help"><button type="button" className="admin-link-button" onClick={() => void resend()} aria-busy={isResending}>{isResending ? 'Sending…' : 'Send a new code'}</button></p>}
    <p className="admin-help"><button type="button" className="admin-link-button" onClick={() => onRestart('')}>Back to email and password</button></p>
  </section>
}
