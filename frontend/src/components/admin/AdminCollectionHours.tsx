import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import AdminOlderEntries from './AdminOlderEntries'
import { collectionHoursContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { getCollectionHours, getOlderCollectionHoursHistory, updateCollectionHours } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { CollectionHoursResponse } from '../../types'

interface AdminCollectionHoursProps {
  onSessionEnded: () => void
}

// When customers can collect pickup orders, on the delivery screen. Every change is recorded on the server.
export default function AdminCollectionHours({ onSessionEnded }: AdminCollectionHoursProps) {
  const [data, setData] = useState<CollectionHoursResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let isCurrent = true
    getCollectionHours()
      .then((loaded) => { if (isCurrent) setData(loaded) })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load the collection hours.')
      })
    return () => { isCurrent = false }
  }, [onSessionEnded])

  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data) return
    const hours = String(new FormData(event.currentTarget).get('hours') ?? '').trim()
    if (hours === data.hours) {
      setResult({ kind: 'success', message: 'No changes to save.' })
      return
    }
    setResult(null)
    setFieldError('')
    setIsSaving(true)
    try {
      setData(await updateCollectionHours(hours))
      setResult({ kind: 'success', message: 'Collection hours saved.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setFieldError(error.errors.hours ?? '')
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to save the collection hours.' })
    } finally {
      setIsSaving(false)
    }
  }

  return <section className="admin-collection-hours" aria-labelledby="admin-collection-title">
    <h2 id="admin-collection-title">{collectionHoursContent.title}</h2>
    <p className="admin-intro">{collectionHoursContent.intro}</p>
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : !data ? <p className="admin-loading" role="status">Loading collection hours…</p>
      : <div className="admin-editor-layout">
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-field">
            <label htmlFor="collection-hours">{collectionHoursContent.label}</label>
            <input id="collection-hours" name="hours" type="text" required maxLength={120} autoComplete="off" defaultValue={data.hours} aria-describedby={`collection-hours-hint${fieldError ? ' collection-hours-error' : ''}`} />
            <small id="collection-hours-hint">{collectionHoursContent.hint}</small>
            {fieldError && <small className="admin-field-error" id="collection-hours-error">{fieldError}</small>}
          </div>
          <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Save collection hours <Arrow /></>}</button>
        </form>
        <section className="admin-history" aria-labelledby="admin-collection-history-title">
          <h2 id="admin-collection-history-title">Change history</h2>
          <AdminOlderEntries kind="history" newest={data.history} cursor={data.historyCursor} loadOlder={getOlderCollectionHoursHistory} onSessionEnded={onSessionEnded}>
            {(history) => history.length === 0 ? <p>No changes yet.</p>
              : <ol>{history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
                <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actor.name} ({entry.actor.email})</p>
                <ul>{entry.changes.map((change) => <li key={change.field}><strong>{collectionHoursContent.label}</strong>: {change.from} → {change.to}</li>)}</ul>
              </li>)}</ol>}
          </AdminOlderEntries>
        </section>
      </div>}
  </section>
}
