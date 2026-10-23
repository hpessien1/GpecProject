import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import { bankTransferContent, bankTransferFieldLabels } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { getBankTransfer, updateBankTransfer } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { BankTransferResponse, BankTransferSettings, CurrencyInfo } from '../../types'

interface AdminBankTransferProps {
  currency: CurrencyInfo | null
  onSessionEnded: () => void
}

type TextField = 'bankName' | 'accountName' | 'accountNumber' | 'instructions'

function describeValue(field: keyof BankTransferSettings, value: unknown) {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (field === 'enabled') return value ? 'On' : 'Off'
  return String(value)
}

// GPEC's Nigerian bank account for customers paying by transfer: bank, account name, and 10-digit
// NUBAN account number. Only changed fields are sent; every change is recorded and emailed to all admins.
export default function AdminBankTransfer({ currency, onSessionEnded }: AdminBankTransferProps) {
  const [data, setData] = useState<BankTransferResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const [savedVersion, setSavedVersion] = useState(0)
  const resultRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let isCurrent = true
    getBankTransfer()
      .then((loaded) => { if (isCurrent) setData(loaded) })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load the bank details.')
      })
    return () => { isCurrent = false }
  }, [onSessionEnded])

  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data) return
    const formData = new FormData(event.currentTarget)
    const field = (name: string) => String(formData.get(name) ?? '').trim()
    const values: BankTransferSettings = {
      enabled: formData.get('enabled') === 'on',
      bankName: field('bankName'),
      accountName: field('accountName'),
      // Spaces people type between the digits ("0123 456 789") are not part of the number.
      accountNumber: field('accountNumber').replace(/\s/g, ''),
      instructions: field('instructions'),
      payWithinDays: Number(field('payWithinDays')),
    }
    const changes = Object.fromEntries(Object.entries(values).filter(([name, value]) => data.settings[name as keyof BankTransferSettings] !== value))
    if (Object.keys(changes).length === 0) {
      setResult({ kind: 'success', message: 'No changes to save.' })
      return
    }
    setResult(null)
    setServerErrors({})
    setIsSaving(true)
    try {
      setData(await updateBankTransfer(changes))
      setSavedVersion((version) => version + 1)
      setResult({ kind: 'success', message: 'Bank details saved. All admins have been emailed about the change.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setServerErrors(error.errors)
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to save the bank details.' })
    } finally {
      setIsSaving(false)
    }
  }

  const textInput = (name: TextField, props: { maxLength: number, required?: boolean, inputMode?: 'numeric', pattern?: string, autoComplete?: string }) => <div className="admin-field">
    <label htmlFor={`bank-${name}`}>{bankTransferFieldLabels[name]}</label>
    {name === 'instructions'
      ? <textarea id={`bank-${name}`} name={name} rows={3} maxLength={props.maxLength} defaultValue={data?.settings[name]} aria-describedby={`bank-${name}-hint${serverErrors[name] ? ` bank-${name}-error` : ''}`} />
      : <input id={`bank-${name}`} name={name} {...props} defaultValue={data?.settings[name]} aria-describedby={`bank-${name}-hint${serverErrors[name] ? ` bank-${name}-error` : ''}`} />}
    <small id={`bank-${name}-hint`}>{bankTransferContent.hints[name]}</small>
    {serverErrors[name] && <small className="admin-field-error" id={`bank-${name}-error`}>{serverErrors[name]}</small>}
  </div>

  return <section aria-labelledby="admin-bank-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {bankTransferContent.eyebrow}</p><h1 id="admin-bank-title" tabIndex={-1}>{bankTransferContent.title}</h1></div>
    </div>
    <p className="admin-intro">{bankTransferContent.intro}</p>
    <p className="admin-notice">{bankTransferContent.warning}</p>
    {currency?.code !== 'NGN' && <p className="admin-notice">{bankTransferContent.noCurrency}</p>}
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : !data ? <p className="admin-loading" role="status">Loading bank details…</p>
      : <div className="admin-editor-layout">
        <form key={savedVersion} className="admin-form" onSubmit={handleSubmit}>
          {textInput('bankName', { maxLength: 120 })}
          {textInput('accountName', { maxLength: 120 })}
          {textInput('accountNumber', { maxLength: 13, inputMode: 'numeric', pattern: '[0-9 ]*', autoComplete: 'off' })}
          {textInput('instructions', { maxLength: 500 })}
          <div className="admin-field">
            <label htmlFor="bank-payWithinDays">{bankTransferFieldLabels.payWithinDays}</label>
            <input id="bank-payWithinDays" name="payWithinDays" type="number" min={1} max={30} step={1} required defaultValue={data.settings.payWithinDays} aria-describedby="bank-payWithinDays-hint" />
            <small id="bank-payWithinDays-hint">{bankTransferContent.hints.payWithinDays}</small>
            {serverErrors.payWithinDays && <small className="admin-field-error">{serverErrors.payWithinDays}</small>}
          </div>
          <div className="admin-field admin-checkbox">
            <label><input name="enabled" type="checkbox" defaultChecked={data.settings.enabled} /> {bankTransferFieldLabels.enabled}: customers can choose bank transfer and see these details.</label>
            {serverErrors.enabled && <small className="admin-field-error">{serverErrors.enabled}</small>}
          </div>
          <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Save bank details <Arrow /></>}</button>
        </form>
        <section className="admin-history" aria-labelledby="admin-bank-history-title">
          <h2 id="admin-bank-history-title">Change history</h2>
          {data.history.length === 0 ? <p>No changes yet.</p>
            : <ol>{data.history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
              <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actor.name} ({entry.actor.email})</p>
              <ul>{entry.changes.map((change) => <li key={change.field}><strong>{bankTransferFieldLabels[change.field]}</strong>: {describeValue(change.field, change.from)} → {describeValue(change.field, change.to)}</li>)}</ul>
            </li>)}</ol>}
        </section>
      </div>}
  </section>
}
