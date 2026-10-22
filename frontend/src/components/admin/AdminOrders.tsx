import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import { fulfilmentMethodLabels, orderStageLabels, ordersContent, requestSearchContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { listOrders } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import { formatPrice } from '../../utils/money'
import type { AdminOrdersPage, OrderStage } from '../../types'

interface AdminOrdersProps {
  onSessionEnded: () => void
}

const STAGE_FILTERS = [null, ...Object.keys(orderStageLabels)] as (OrderStage | null)[]

// Orders from the shop, newest first, searchable and filterable by stage.
export default function AdminOrders({ onSessionEnded }: AdminOrdersProps) {
  const [page, setPage] = useState(1)
  const [stage, setStage] = useState<OrderStage | null>(null)
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<AdminOrdersPage | null>(null)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    listOrders(page, stage, search)
      .then((loaded) => { if (isCurrent) setResult(loaded) })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        if (loadError instanceof ApiError && loadError.status === 401) onSessionEnded()
        else setError(loadError instanceof Error ? loadError.message : 'Unable to load orders.')
      })
    return () => { isCurrent = false }
  }, [page, stage, search, loadAttempt, onSessionEnded])

  function chooseStage(nextStage: OrderStage | null) {
    setStage(nextStage)
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
  const countFor = (filter: OrderStage | null) => counts ? (filter ? counts[filter] : Object.values(counts).reduce((sum, count) => sum + count, 0)) : null
  return <section aria-labelledby="admin-orders-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {ordersContent.eyebrow}</p><h1 id="admin-orders-title" tabIndex={-1}>{ordersContent.title}</h1></div>
    </div>
    <form className="admin-form admin-search" role="search" onSubmit={handleSearchSubmit}>
      <div className="admin-field">
        <label htmlFor="order-search">{requestSearchContent.label}</label>
        <div className="admin-search-row">
          <input id="order-search" type="search" maxLength={100} value={searchText} onChange={(event) => setSearchText(event.target.value)} aria-describedby="order-search-help" />
          <button className="button button-primary" type="submit">Search</button>
          {search && <button className="text-link" type="button" onClick={() => applySearch('')}>Clear search</button>}
        </div>
        <small id="order-search-help">{requestSearchContent.help}</small>
      </div>
    </form>
    <div className="admin-filters" role="group" aria-label="Show orders by stage">
      {STAGE_FILTERS.map((filter) => <button key={filter ?? 'all'} type="button" aria-pressed={stage === filter} onClick={() => chooseStage(filter)}>
        {filter ? orderStageLabels[filter] : 'All'}{countFor(filter) !== null && <span>{countFor(filter)}</span>}
      </button>)}
    </div>
    {error ? <div className="shop-status" role="alert"><p>{error}</p><button type="button" className="button button-primary" onClick={retry}>Try again</button></div>
      : !result ? <p className="admin-loading" role="status">Loading…</p>
      : result.items.length === 0 ? <div className="shop-status" role="status"><p>{search ? ordersContent.noMatches(search) : ordersContent.empty}</p></div>
      : <>
        <ul className="admin-request-list admin-order-list">{result.items.map((order) => <li key={order.reference}>
          <div className="admin-request-main">
            <strong>{order.name}{order.company && <span> · {order.company}</span>}</strong>
            <p>{order.summary}</p>
            <small><time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time> · {order.reference} · {fulfilmentMethodLabels[order.fulfilmentMethod]}</small>
          </div>
          <span className="admin-order-total">{formatPrice(order.total, order.currency)}</span>
          <span className={`admin-status admin-status-${order.stage}`}>{orderStageLabels[order.stage]}</span>
          <a className="admin-edit-link" href={`#admin/orders/${encodeURIComponent(order.reference)}`} aria-label={`Open order ${order.reference} from ${order.name}`}>Open <Arrow /></a>
        </li>)}</ul>
        {result.totalPages > 1 && <nav className="shop-pagination" aria-label="Order list pages">
          <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1}>Previous</button>
          <span>Page {page} of {result.totalPages}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page === result.totalPages}>Next</button>
        </nav>}
      </>}
  </section>
}
