import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { olderEntriesContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import type { OlderPage } from '../../types'

interface AdminOlderEntriesProps<Entry> {
  kind: keyof typeof olderEntriesContent
  // The newest page, as the server sent it with the record, and the cursor for the next, older one
  // (null when there is none).
  newest: Entry[]
  cursor: string | null
  loadOlder: (before: string) => Promise<OlderPage<Entry>>
  onSessionEnded: () => void
  children: (entries: Entry[]) => ReactNode
}

interface Loaded<Entry> {
  newest: Entry[]
  older: Entry[]
  cursor: string | null
}

// A change history or a list of notes, newest first, with "Show older" adding the next page below the
// entries already shown. A new newest page (after a save, or a note added) starts the list again.
export default function AdminOlderEntries<Entry>({ kind, newest, cursor, loadOlder, onSessionEnded, children }: AdminOlderEntriesProps<Entry>) {
  const [loaded, setLoaded] = useState<Loaded<Entry>>({ newest, older: [], cursor })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLParagraphElement>(null)
  const content = olderEntriesContent[kind]

  // React's pattern for resetting state when a prop changes, without an extra render of stale entries.
  if (loaded.newest !== newest) {
    setLoaded({ newest, older: [], cursor })
    setError('')
  }

  const hasLoadedOlder = loaded.older.length > 0
  const isComplete = hasLoadedOlder && loaded.cursor === null
  // The button disappears with the last page, which would drop keyboard focus; move it to the
  // message that takes its place.
  useEffect(() => { if (isComplete) endRef.current?.focus() }, [isComplete])

  async function showOlder() {
    if (isLoading || !loaded.cursor) return
    setError('')
    setIsLoading(true)
    try {
      const page = await loadOlder(loaded.cursor)
      setLoaded((current) => ({ ...current, older: [...current.older, ...page.entries], cursor: page.cursor }))
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) return onSessionEnded()
      setError(loadError instanceof Error ? loadError.message : content.error)
    } finally {
      setIsLoading(false)
    }
  }

  return <>
    {children([...loaded.newest, ...loaded.older])}
    {error && <p className="form-error" role="alert">{error}</p>}
    {/* Not disabled while loading: that would drop keyboard focus. A second press is ignored. */}
    {loaded.cursor && <button type="button" className="admin-show-older" aria-busy={isLoading} onClick={() => void showOlder()}>{isLoading ? 'Loading…' : content.button}</button>}
    {isComplete && <p className="admin-older-end" role="status" tabIndex={-1} ref={endRef}>{content.end}</p>}
  </>
}
