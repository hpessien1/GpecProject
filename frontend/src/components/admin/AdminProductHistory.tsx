import { useEffect, useState } from 'react'
import { productFieldLabels, productStatusLabels } from '../../data/adminContent'
import { productGroups } from '../../data/landingContent'
import AdminOlderEntries from './AdminOlderEntries'
import { ApiError } from '../../services/apiClient'
import { getProductHistory } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import { formatPrice } from '../../utils/money'
import type { CurrencyInfo, OlderPage, ProductHistoryEntry } from '../../types'

interface AdminProductHistoryProps {
  productId: string
  currency: CurrencyInfo | null
  onSessionEnded: () => void
}

function describeValue(field: ProductHistoryEntry['changes'][number]['field'], value: unknown, currency: CurrencyInfo | null) {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (field === 'price' && typeof value === 'number') return currency ? formatPrice(value, currency) : `${value} (smallest unit)`
  if (field === 'status' && (value === 'active' || value === 'archived')) return productStatusLabels[value]
  if (field === 'category') return productGroups.find((group) => group.category === value)?.title ?? String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(none)'
  return String(value)
}

// Who changed what and when, newest first, a page at a time.
export default function AdminProductHistory({ productId, currency, onSessionEnded }: AdminProductHistoryProps) {
  const [history, setHistory] = useState<OlderPage<ProductHistoryEntry> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true
    getProductHistory(productId)
      .then((loaded) => { if (isCurrent) setHistory(loaded) })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        if (loadError instanceof ApiError && loadError.status === 401) onSessionEnded()
        else setError(loadError instanceof Error ? loadError.message : 'Unable to load the change history.')
      })
    return () => { isCurrent = false }
  }, [productId, onSessionEnded])

  return <section className="admin-history" aria-labelledby="admin-history-title">
    <h2 id="admin-history-title">Change history</h2>
    {error ? <p className="form-error" role="alert">{error}</p>
      : !history ? <p className="admin-loading" role="status">Loading history…</p>
      : <AdminOlderEntries kind="history" newest={history.entries} cursor={history.cursor} loadOlder={(before) => getProductHistory(productId, before)} onSessionEnded={onSessionEnded}>
        {(entries) => entries.length === 0 ? <p>No changes recorded yet. Sample products added by the seed script have no history until someone edits them.</p>
          : <ol>{entries.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
            <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.action === 'product.sale' ? <>Sold online · order {entry.orderReference}</> : <>{entry.actor.name} ({entry.actor.email}) · {entry.action === 'product.create' ? 'Created' : 'Changed'}</>}</p>
            <ul>{entry.changes.filter((change) => entry.action !== 'product.create' || change.to !== null).map((change) => <li key={change.field}>
              <strong>{productFieldLabels[change.field]}</strong>{entry.action !== 'product.create' && <>: {describeValue(change.field, change.from, currency)} →</>} {describeValue(change.field, change.to, currency)}
            </li>)}</ul>
          </li>)}</ol>}
      </AdminOlderEntries>}
  </section>
}
