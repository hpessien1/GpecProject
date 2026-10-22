import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import { requestKindContent, requestSearchContent, requestStatusLabels } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { listRequests } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { AdminRequestKind, AdminRequestsPage, RequestStatus } from '../../types'

interface AdminRequestListProps {
  kind: AdminRequestKind
  onSessionEnded: () => void
}

const STATUS_FILTERS: (RequestStatus | null)[] = [null, 'new', 'in_progress', 'closed']

// Order enquiries or contact requests, newest first, searchable and filterable by status.
export default function AdminRequestList({ kind, onSessionEnded }: AdminRequestListProps) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<RequestStatus | null>(null)
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<AdminRequestsPage | null>(null)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const content = requestKindContent[kind]

  useEffect(() => {
    let isCurrent = true
    listRequests(kind, page, status, search)
      .then((loaded) => { if (isCurrent) setResult(loaded) })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        if (loadError instanceof ApiError && loadError.status === 401) onSessionEnded()
        else setError(loadError instanceof Error ? loadError.message : 'Unable to load the list.')
      })
    return () => { isCurrent = false }
  }, [kind, page, status, search, loadAttempt, onSessionEnded])

  function chooseStatus(nextStatus: RequestStatus | null) {
    setStatus(nextStatus)
    setPage(1)
  }

  function applySearch(nextSearch: string) {
    setSearchText(nextSearch)
    setSearch(nextSearch.trim())
    setPage(1)
  }

  function handleSearchSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    applySearch(searchText)
  }

  function retry() {
    setError('')
    setLoadAttempt((attempt) => attempt + 1)
  }

  const counts = result?.counts
  const countFor = (filter: RequestStatus | null) => counts ? (filter ? counts[filter] : counts.new + counts.in_progress + counts.closed) : null
  return <section aria-labelledby="admin-requests-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {content.eyebrow}</p><h1 id="admin-requests-title" tabIndex={-1}>{content.title}</h1></div>
    </div>
    <form className="admin-form admin-search" role="search" onSubmit={handleSearchSubmit}>
      <div className="admin-field">
        <label htmlFor="request-search">{requestSearchContent.label}</label>
        <div className="admin-search-row">
          <input id="request-search" type="search" maxLength={100} value={searchText} onChange={(event) => setSearchText(event.target.value)} aria-describedby="request-search-help" />
          <button className="button button-primary" type="submit">Search</button>
          {search && <button className="text-link" type="button" onClick={() => applySearch('')}>Clear search</button>}
        </div>
        <small id="request-search-help">{requestSearchContent.help}</small>
      </div>
    </form>
    <div className="admin-filters" role="group" aria-label="Show requests by status">
      {STATUS_FILTERS.map((filter) => <button key={filter ?? 'all'} type="button" aria-pressed={status === filter} onClick={() => chooseStatus(filter)}>
        {filter ? requestStatusLabels[filter] : 'All'}{countFor(filter) !== null && <span>{countFor(filter)}</span>}
      </button>)}
    </div>
    {error ? <div className="shop-status" role="alert"><p>{error}</p><button type="button" className="button button-primary" onClick={retry}>Try again</button></div>
      : !result ? <p className="admin-loading" role="status">Loading…</p>
      : result.items.length === 0 ? <div className="shop-status" role="status"><p>{search ? requestSearchContent.noMatches(search) : content.empty}</p></div>
      : <>
        <ul className="admin-request-list">{result.items.map((item) => <li key={item.reference}>
          <div className="admin-request-main">
            <strong>{item.name}{item.company && <span> · {item.company}</span>}</strong>
            <p>{item.summary}</p>
            <small><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time> · {item.reference}</small>
          </div>
          <span className={`admin-status admin-status-${item.status}`}>{requestStatusLabels[item.status]}</span>
          <a className="admin-edit-link" href={`#admin/${kind}/${encodeURIComponent(item.reference)}`} aria-label={`Open ${item.reference} from ${item.name}`}>Open <Arrow /></a>
        </li>)}</ul>
        {result.totalPages > 1 && <nav className="shop-pagination" aria-label="List pages">
          <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1}>Previous</button>
          <span>Page {page} of {result.totalPages}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page === result.totalPages}>Next</button>
        </nav>}
      </>}
  </section>
}
