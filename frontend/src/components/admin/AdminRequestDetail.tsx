import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import { requestKindContent, requestNotesContent, requestStatusLabels } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { addRequestNote, getRequest, setRequestStatus } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { AdminRequestKind, AdminRequestResponse, RequestStatus } from '../../types'

interface AdminRequestDetailProps {
  kind: AdminRequestKind
  reference: string
  onSessionEnded: () => void
}

function isRequestStatus(value: string): value is RequestStatus {
  return Object.hasOwn(requestStatusLabels, value)
}

// Everything the customer sent, a way to reply, staff's internal notes, the follow-up status, and
// who changed it when.
export default function AdminRequestDetail({ kind, reference, onSessionEnded }: AdminRequestDetailProps) {
  const [data, setData] = useState<AdminRequestResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const [noteText, setNoteText] = useState('')
  const [isSavingNote, setIsSavingNote] = useState(false)
  const [noteResult, setNoteResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const noteResultRef = useRef<HTMLParagraphElement>(null)
  const content = requestKindContent[kind]

  useEffect(() => {
    let isCurrent = true
    getRequest(kind, reference)
      .then((loaded) => { if (isCurrent) setData(loaded) })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load this request.')
      })
    return () => { isCurrent = false }
  }, [kind, reference, onSessionEnded])

  // The button is disabled while saving, which drops keyboard focus; move it to the result instead.
  useEffect(() => { resultRef.current?.focus() }, [result])
  useEffect(() => { noteResultRef.current?.focus() }, [noteResult])

  // The text stays in the box if saving fails, and is cleared once the note is saved.
  async function handleNoteSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!noteText.trim()) {
      setNoteResult({ kind: 'error', message: 'Write a note before adding it.' })
      return
    }
    setNoteResult(null)
    setIsSavingNote(true)
    try {
      setData(await addRequestNote(kind, reference, noteText))
      setNoteText('')
      setNoteResult({ kind: 'success', message: 'Note added.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      setNoteResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to save the note.' })
    } finally {
      setIsSavingNote(false)
    }
  }

  async function handleStatusSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data) return
    const status = String(new FormData(event.currentTarget).get('status') ?? '')
    if (!isRequestStatus(status)) return
    if (status === data.item.status) {
      setResult({ kind: 'success', message: `The status is already ${requestStatusLabels[status]}.` })
      return
    }
    setResult(null)
    setIsSaving(true)
    try {
      setData(await setRequestStatus(kind, reference, status))
      setResult({ kind: 'success', message: `Status changed to ${requestStatusLabels[status]}.` })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to update the status.' })
    } finally {
      setIsSaving(false)
    }
  }

  const item = data?.item
  return <section aria-labelledby="admin-request-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {content.title}</p><h1 id="admin-request-title" tabIndex={-1}>{reference}</h1></div>
      <a className="text-link" href={`#admin/${kind}`}>Back to {content.title.toLowerCase()}</a>
    </div>
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : !data || !item ? <p className="admin-loading" role="status">Loading…</p>
      : <div className="admin-editor-layout">
        <div className="admin-request-detail">
          <p className="admin-request-received">Received <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time> <span className={`admin-status admin-status-${item.status}`}>{requestStatusLabels[item.status]}</span></p>
          <h2>Customer</h2>
          <dl>
            <dt>Name</dt><dd>{item.customer.fullName}</dd>
            {item.customer.company && <><dt>Company</dt><dd>{item.customer.company}</dd></>}
            <dt>Email</dt><dd><a href={`mailto:${item.customer.email}?subject=${encodeURIComponent(`Your GPEC request ${item.reference}`)}`}>{item.customer.email}</a></dd>
            {item.customer.phone && <><dt>Phone</dt><dd><a href={`tel:${item.customer.phone.replace(/[^\d+]/g, '')}`}>{item.customer.phone}</a></dd></>}
          </dl>
          {item.subject && <><h2>Subject</h2><p>{item.subject}</p></>}
          <h2>Message</h2><p className="admin-request-message">{item.message}</p>
          <section className="admin-notes" aria-labelledby="admin-notes-title">
            <h2 id="admin-notes-title">{requestNotesContent.title}</h2>
            <form className="admin-form admin-note-form" onSubmit={handleNoteSubmit}>
              <div className="admin-field">
                <label htmlFor="request-note">{requestNotesContent.label}</label>
                <textarea id="request-note" rows={3} maxLength={2000} value={noteText} onChange={(event) => setNoteText(event.target.value)} aria-describedby="request-note-help" />
                <small id="request-note-help">{requestNotesContent.help}</small>
              </div>
              {noteResult && <p className={noteResult.kind === 'success' ? 'success-message' : 'form-error'} role={noteResult.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={noteResultRef}>{noteResult.message}</p>}
              <button className="button button-primary" type="submit" disabled={isSavingNote}>{isSavingNote ? 'Saving…' : <>Add note <Arrow /></>}</button>
            </form>
            {data.notes.length === 0 ? <p className="admin-notes-empty">{requestNotesContent.empty}</p>
              : <ol className="admin-note-list">{data.notes.map((note, index) => <li key={`${note.createdAt}-${index}`}>
                <p className="admin-history-meta"><time dateTime={note.createdAt}>{formatDateTime(note.createdAt)}</time> · {note.author.name} ({note.author.email})</p>
                <p className="admin-request-message">{note.text}</p>
              </li>)}</ol>}
          </section>
        </div>
        <aside className="admin-request-side">
          <form className="admin-form admin-status-form" onSubmit={handleStatusSubmit}>
            <div className="admin-field">
              <label htmlFor="request-status">Follow-up status</label>
              <select id="request-status" name="status" key={item.status} defaultValue={item.status}>
                {Object.entries(requestStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Update status <Arrow /></>}</button>
          </form>
          <section className="admin-history" aria-labelledby="admin-request-history-title">
            <h2 id="admin-request-history-title">Status history</h2>
            {data.history.length === 0 ? <p>No changes yet. New requests start as “New”.</p>
              : <ol>{data.history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
                <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actor.name} ({entry.actor.email})</p>
                <ul>{entry.changes.map((change) => <li key={change.field}>{requestStatusLabels[change.from]} → {requestStatusLabels[change.to]}</li>)}</ul>
              </li>)}</ol>}
          </section>
        </aside>
      </div>}
  </section>
}
