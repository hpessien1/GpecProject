import { useEffect, useRef, useState } from 'react'
import AdminDeliveryAreaForm from './AdminDeliveryAreaForm'
import type { DeliveryAreaFormValues } from './AdminDeliveryAreaForm'
import { deliveryAreaFieldLabels, deliveryAreaStatusLabels, deliveryAreasContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { getDeliveryArea, getDeliveryAreaHistory, updateDeliveryArea } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import { formatPrice } from '../../utils/money'
import type { AdminDeliveryArea, CurrencyInfo, DeliveryAreaHistoryEntry, EditableDeliveryAreaFields } from '../../types'

interface AdminDeliveryAreaEditorProps {
  areaId: string
  currency: CurrencyInfo | null
  onSessionEnded: () => void
}

function describeValue(field: keyof EditableDeliveryAreaFields, value: unknown, currency: CurrencyInfo | null) {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (field === 'fee' && typeof value === 'number') return currency ? formatPrice(value, currency) : `${value} (smallest unit)`
  if (field === 'status' && (value === 'active' || value === 'archived')) return deliveryAreaStatusLabels[value]
  return String(value)
}

// One delivery area: edit it (only changed fields are sent) and see who changed what, when.
export default function AdminDeliveryAreaEditor({ areaId, currency, onSessionEnded }: AdminDeliveryAreaEditorProps) {
  const [area, setArea] = useState<AdminDeliveryArea | null>(null)
  const [history, setHistory] = useState<DeliveryAreaHistoryEntry[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const [savedVersion, setSavedVersion] = useState(0)
  const resultRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let isCurrent = true
    Promise.all([getDeliveryArea(areaId), getDeliveryAreaHistory(areaId)])
      .then(([loadedArea, loadedHistory]) => {
        if (!isCurrent) return
        setArea(loadedArea)
        setHistory(loadedHistory)
      })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load the delivery area.')
      })
    return () => { isCurrent = false }
  }, [areaId, savedVersion, onSessionEnded])

  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleSubmit(values: DeliveryAreaFormValues) {
    if (!area) return
    const changes = Object.fromEntries(Object.entries(values).filter(([field, value]) => area[field as keyof EditableDeliveryAreaFields] !== value))
    if (Object.keys(changes).length === 0) {
      setResult({ kind: 'success', message: 'No changes to save.' })
      return
    }
    setResult(null)
    setServerErrors({})
    setIsSaving(true)
    try {
      await updateDeliveryArea(area.id, changes)
      setSavedVersion((version) => version + 1)
      setResult({ kind: 'success', message: 'Changes saved.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setServerErrors(error.errors)
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to save the delivery area.' })
    } finally {
      setIsSaving(false)
    }
  }

  return <section aria-labelledby="admin-area-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {deliveryAreasContent.title}</p><h1 id="admin-area-title" tabIndex={-1}>{area?.name ?? 'Delivery area'}</h1></div>
      <a className="text-link" href="#admin/delivery">Back to delivery areas</a>
    </div>
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : !area || !history ? <p className="admin-loading" role="status">Loading…</p>
      : <div className="admin-editor-layout">
        {currency ? <AdminDeliveryAreaForm key={`form-${savedVersion}`} area={area} currency={currency} isSaving={isSaving} serverErrors={serverErrors} onSubmit={handleSubmit} />
          : <p className="admin-notice">{deliveryAreasContent.noCurrency}</p>}
        <section className="admin-history" aria-labelledby="admin-area-history-title">
          <h2 id="admin-area-history-title">Change history</h2>
          <p>{deliveryAreasContent.pastOrders}</p>
          {history.length === 0 && <p>No changes recorded yet. Demo areas added by the demo command have no history until someone edits them.</p>}
          <ol>{history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
            <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actor.name} ({entry.actor.email}) · {entry.action === 'deliveryArea.create' ? 'Added' : 'Changed'}</p>
            <ul>{entry.changes.filter((change) => entry.action === 'deliveryArea.update' || change.to !== null).map((change) => <li key={change.field}>
              <strong>{deliveryAreaFieldLabels[change.field]}</strong>{entry.action === 'deliveryArea.update' && <>: {describeValue(change.field, change.from, currency)} →</>} {describeValue(change.field, change.to, currency)}
            </li>)}</ul>
          </li>)}</ol>
        </section>
      </div>}
  </section>
}
