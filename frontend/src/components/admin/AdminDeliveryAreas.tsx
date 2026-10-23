import { useEffect, useRef, useState } from 'react'
import Arrow from '../Arrow'
import Pagination from '../Pagination'
import AdminDeliveryAreaForm from './AdminDeliveryAreaForm'
import type { DeliveryAreaFormValues } from './AdminDeliveryAreaForm'
import { deliveryAreasContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { createDeliveryArea, listDeliveryAreas } from '../../services/adminApi'
import { formatPrice } from '../../utils/money'
import { showingRange } from '../../utils/paging'
import { useRememberedState } from '../../utils/rememberedState'
import type { AdminDeliveryAreasPage, CurrencyInfo } from '../../types'

interface AdminDeliveryAreasProps {
  currency: CurrencyInfo | null
  onSessionEnded: () => void
}

// Where GPEC delivers and for how much. Every change is recorded on the server.
export default function AdminDeliveryAreas({ currency, onSessionEnded }: AdminDeliveryAreasProps) {
  // Kept while staff open an area and come back.
  const [page, setPage] = useRememberedState('delivery-areas', 1)
  const [listing, setListing] = useState<AdminDeliveryAreasPage | null>(null)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  // A new key empties the add form after a successful save.
  const [formVersion, setFormVersion] = useState(0)
  const resultRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let isCurrent = true
    listDeliveryAreas(page)
      .then((loaded) => {
        if (!isCurrent) return
        // A remembered page that no longer exists: show the last one rather than an empty list.
        if (page > loaded.totalPages) setPage(loaded.totalPages)
        else setListing(loaded)
      })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        if (loadError instanceof ApiError && loadError.status === 401) onSessionEnded()
        else setError(loadError instanceof Error ? loadError.message : 'Unable to load the delivery areas.')
      })
    return () => { isCurrent = false }
  }, [page, loadAttempt, onSessionEnded, setPage])

  useEffect(() => { resultRef.current?.focus() }, [result])

  // Back to the top of the list, as a new page would load.
  function choosePage(nextPage: number) {
    setPage(nextPage)
    document.getElementById('admin-delivery-title')?.focus()
  }

  function retry() {
    setError('')
    setLoadAttempt((attempt) => attempt + 1)
  }

  async function handleAdd(values: DeliveryAreaFormValues) {
    setResult(null)
    setServerErrors({})
    setIsSaving(true)
    try {
      const created = await createDeliveryArea(values)
      // Reload the page: the new area takes its place in the sorted list, perhaps on another page.
      setLoadAttempt((attempt) => attempt + 1)
      setFormVersion((version) => version + 1)
      setResult({ kind: 'success', message: `${created.name} added.` })
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) return onSessionEnded()
      if (saveError instanceof ApiError) setServerErrors(saveError.errors)
      setResult({ kind: 'error', message: saveError instanceof Error ? saveError.message : 'Unable to add the delivery area.' })
    } finally {
      setIsSaving(false)
    }
  }

  return <section aria-labelledby="admin-delivery-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {deliveryAreasContent.eyebrow}</p><h1 id="admin-delivery-title" tabIndex={-1}>{deliveryAreasContent.title}</h1></div>
    </div>
    <p className="admin-intro">{deliveryAreasContent.intro}</p>
    {!currency && <p className="admin-notice">{deliveryAreasContent.noCurrency}</p>}
    {error ? <div className="shop-status" role="alert"><p>{error}</p><button type="button" className="button button-primary" onClick={retry}>Try again</button></div>
      : !listing ? <p className="admin-loading" role="status">Loading delivery areas…</p>
      : <div className="admin-editor-layout">
        <div>
          {listing.areas.length === 0 ? <div className="shop-status" role="status"><p>{deliveryAreasContent.empty}</p></div>
            : <>
              <p className="admin-count">{showingRange(page, listing.pageSize, listing.areas.length, listing.total, { one: 'delivery area', many: 'delivery areas' })}, including archived ones.</p>
              <ul className="admin-product-list admin-area-list">{listing.areas.map((area) => <li key={area.id} className={area.status === 'archived' ? 'is-archived' : ''}>
              <div className="admin-product-main"><strong>{area.name}</strong>{area.description && <span>{area.description}</span>}</div>
              <span className="admin-product-price">{currency ? formatPrice(area.fee, currency) : 'No fee'}</span>
              <span className="admin-product-tags">{area.status === 'archived' && <span className="admin-tag">Archived</span>}</span>
              <a className="admin-edit-link" href={`#admin/delivery/${encodeURIComponent(area.id)}`} aria-label={`Edit ${area.name}`}>Edit <Arrow /></a>
            </li>)}</ul>
              {listing.totalPages > 1 && <Pagination label="Delivery area pages" page={page} totalPages={listing.totalPages} onSelect={choosePage} />}
            </>}
          <p className="admin-count">{deliveryAreasContent.pastOrders}</p>
        </div>
        {currency && <section className="admin-history" aria-labelledby="admin-delivery-add-title">
          <h2 id="admin-delivery-add-title">Add a delivery area</h2>
          {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
          <AdminDeliveryAreaForm key={formVersion} area={null} currency={currency} isSaving={isSaving} serverErrors={serverErrors} onSubmit={handleAdd} />
        </section>}
      </div>}
  </section>
}
