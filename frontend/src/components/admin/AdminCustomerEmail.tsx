import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import AdminOlderEntries from './AdminOlderEntries'
import { customerEmailContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { getCustomerEmail, getOlderCustomerEmailHistory, updateCustomerEmail } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { CustomerEmailResponse } from '../../types'

interface AdminCustomerEmailProps {
  onSessionEnded: () => void
}

// Where customers' replies to their confirmation emails go. Every change is recorded and emailed to
// all admins.
export default function AdminCustomerEmail({ onSessionEnded }: AdminCustomerEmailProps) {
  const [data, setData] = useState<CustomerEmailResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const [savedVersion, setSavedVersion] = useState(0)
  const resultRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let isCurrent = true
    getCustomerEmail()
      .then((loaded) => { if (isCurrent) setData(loaded) })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load the email settings.')
      })
    return () => { isCurrent = false }
  }, [onSessionEnded])

  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data) return
    const replyTo = String(new FormData(event.currentTarget).get('replyTo') ?? '').trim().toLowerCase()
    if (replyTo === data.settings.replyTo) {
      setResult({ kind: 'success', message: 'No changes to save.' })
      return
    }
    setResult(null)
    setFieldError('')
    setIsSaving(true)
    try {
      setData(await updateCustomerEmail({ replyTo }))
      setSavedVersion((version) => version + 1)
      setResult({ kind: 'success', message: 'Reply-to address saved. All admins have been emailed about the change.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setFieldError(error.errors.replyTo ?? '')
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to save the email settings.' })
    } finally {
      setIsSaving(false)
    }
  }

  return <section aria-labelledby="admin-customer-email-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {customerEmailContent.eyebrow}</p><h1 id="admin-customer-email-title" tabIndex={-1}>{customerEmailContent.title}</h1></div>
    </div>
    <p className="admin-intro">{customerEmailContent.intro}</p>
    <p className="admin-notice">{customerEmailContent.warning}</p>
    {data && !data.emailOn && <p className="admin-notice">{customerEmailContent.emailOff}</p>}
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : !data ? <p className="admin-loading" role="status">Loading email settings…</p>
      : <div className="admin-editor-layout">
        <form key={savedVersion} className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-field">
            <label htmlFor="customer-email-replyTo">{customerEmailContent.label}</label>
            <input id="customer-email-replyTo" name="replyTo" type="email" required maxLength={254} autoComplete="off" defaultValue={data.settings.replyTo} aria-describedby={`customer-email-replyTo-hint${fieldError ? ' customer-email-replyTo-error' : ''}`} />
            <small id="customer-email-replyTo-hint">{customerEmailContent.hint}</small>
            {fieldError && <small className="admin-field-error" id="customer-email-replyTo-error">{fieldError}</small>}
          </div>
          <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Save reply-to address <Arrow /></>}</button>
        </form>
        <section className="admin-history" aria-labelledby="admin-customer-email-history-title">
          <h2 id="admin-customer-email-history-title">Change history</h2>
          <AdminOlderEntries kind="history" newest={data.history} cursor={data.historyCursor} loadOlder={getOlderCustomerEmailHistory} onSessionEnded={onSessionEnded}>
            {(history) => history.length === 0 ? <p>No changes yet.</p>
              : <ol>{history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
                <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actor.name} ({entry.actor.email})</p>
                <ul>{entry.changes.map((change) => <li key={change.field}><strong>{customerEmailContent.label}</strong>: {change.from} → {change.to}</li>)}</ul>
              </li>)}</ol>}
          </AdminOlderEntries>
        </section>
      </div>}
  </section>
}
