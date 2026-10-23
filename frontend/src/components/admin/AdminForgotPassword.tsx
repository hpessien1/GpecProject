import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import { requestPasswordReset } from '../../services/adminApi'

// Asks for a reset link by email. The answer is the same whether or not the address has an account,
// so this screen cannot be used to find out who the admins are.
export default function AdminForgotPassword() {
  const [isSending, setIsSending] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)

  // The button is disabled while sending, which drops keyboard focus; move it to the result instead.
  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    setIsSending(true)
    const email = String(new FormData(event.currentTarget).get('email') ?? '')
    try {
      const { message } = await requestPasswordReset(email)
      setResult({ kind: 'success', message })
    } catch (error) {
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to send the reset link. Please try again.' })
    } finally {
      setIsSending(false)
    }
  }

  return <section className="admin-login" aria-labelledby="admin-forgot-title">
    <p className="eyebrow"><span /> GPEC staff only</p>
    <h1 id="admin-forgot-title" tabIndex={-1}>Forgot your password?</h1>
    <p className="admin-help">Enter the email address you log in with. If it belongs to an admin account, we will email you a link to choose a new password.</p>
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    <form className="admin-form" onSubmit={handleSubmit}>
      <label>Email address<input name="email" type="email" required autoComplete="username" /></label>
      <button className="button button-primary" type="submit" disabled={isSending}>{isSending ? 'Sending…' : <>Email me a reset link <Arrow /></>}</button>
    </form>
    <p className="admin-help"><a className="text-link" href="#admin">Back to login</a></p>
  </section>
}
