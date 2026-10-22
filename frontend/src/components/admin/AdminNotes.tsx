import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import { requestNotesContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { formatDateTime } from '../../utils/dates'
import type { RequestNote } from '../../types'

interface AdminNotesProps {
  notes: RequestNote[]
  // Saves the note; the parent updates `notes` from the server's answer. Throws on failure.
  onAdd: (text: string) => Promise<void>
  onSessionEnded: () => void
}

// Staff's internal notes on a contact request or an order: newest first, never edited or deleted.
// The text stays in the box if saving fails, and is cleared once the note is saved.
export default function AdminNotes({ notes, onAdd, onSessionEnded }: AdminNotesProps) {
  const [text, setText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)

  // The button is disabled while saving, which drops keyboard focus; move it to the result instead.
  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!text.trim()) {
      setResult({ kind: 'error', message: 'Write a note before adding it.' })
      return
    }
    setResult(null)
    setIsSaving(true)
    try {
      await onAdd(text)
      setText('')
      setResult({ kind: 'success', message: 'Note added.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to save the note.' })
    } finally {
      setIsSaving(false)
    }
  }

  return <section className="admin-notes" aria-labelledby="admin-notes-title">
    <h2 id="admin-notes-title">{requestNotesContent.title}</h2>
    <form className="admin-form admin-note-form" onSubmit={handleSubmit}>
      <div className="admin-field">
        <label htmlFor="request-note">{requestNotesContent.label}</label>
        <textarea id="request-note" rows={3} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} aria-describedby="request-note-help" />
        <small id="request-note-help">{requestNotesContent.help}</small>
      </div>
      {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
      <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Add note <Arrow /></>}</button>
    </form>
    {notes.length === 0 ? <p className="admin-notes-empty">{requestNotesContent.empty}</p>
      : <ol className="admin-note-list">{notes.map((note, index) => <li key={`${note.createdAt}-${index}`}>
        <p className="admin-history-meta"><time dateTime={note.createdAt}>{formatDateTime(note.createdAt)}</time> · {note.author.name} ({note.author.email})</p>
        <p className="admin-request-message">{note.text}</p>
      </li>)}</ol>}
  </section>
}
