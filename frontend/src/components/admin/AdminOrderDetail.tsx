import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import AdminNotes from './AdminNotes'
import { fulfilmentMethodLabels, orderStageLabels, ordersContent, paymentStatusLabels } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { addOrderNote, getOrder, setOrderStatus } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import { formatPrice } from '../../utils/money'
import type { AdminOrderResponse, FulfilmentMethod, FulfilmentStatus } from '../../types'

interface AdminOrderDetailProps {
  reference: string
  onSessionEnded: () => void
}

const FULFILMENT_STATUSES: FulfilmentStatus[] = ['new', 'processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled']

// The same rule as the server: pickup orders are never out for delivery, delivery orders never ready
// for pickup.
function statusesFor(method: FulfilmentMethod) {
  return FULFILMENT_STATUSES.filter((status) => status !== (method === 'pickup' ? 'out_for_delivery' : 'ready_for_pickup'))
}

function isFulfilmentStatus(value: string): value is FulfilmentStatus {
  return FULFILMENT_STATUSES.some((status) => status === value)
}

// Everything about one order: who, what, how much, pickup or delivery, payment, the fulfilment
// status staff move along, who changed it when, and staff notes.
export default function AdminOrderDetail({ reference, onSessionEnded }: AdminOrderDetailProps) {
  const [data, setData] = useState<AdminOrderResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let isCurrent = true
    getOrder(reference)
      .then((loaded) => { if (isCurrent) setData(loaded) })
      .catch((error: unknown) => {
        if (!isCurrent) return
        if (error instanceof ApiError && error.status === 401) onSessionEnded()
        else setLoadError(error instanceof Error ? error.message : 'Unable to load this order.')
      })
    return () => { isCurrent = false }
  }, [reference, onSessionEnded])

  // The button is disabled while saving, which drops keyboard focus; move it to the result instead.
  useEffect(() => { resultRef.current?.focus() }, [result])

  async function handleStatusSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!data) return
    const status = String(new FormData(event.currentTarget).get('fulfilmentStatus') ?? '')
    if (!isFulfilmentStatus(status)) return
    if (status === data.order.fulfilmentStatus) {
      setResult({ kind: 'success', message: `The order is already ${orderStageLabels[status]}.` })
      return
    }
    setResult(null)
    setIsSaving(true)
    try {
      setData(await setOrderStatus(reference, status))
      setResult({ kind: 'success', message: `Order moved to ${orderStageLabels[status]}.` })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to update the order.' })
    } finally {
      setIsSaving(false)
    }
  }

  const order = data?.order
  const money = (amount: number) => order ? formatPrice(amount, order.currency) : ''
  return <section aria-labelledby="admin-order-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {ordersContent.title}</p><h1 id="admin-order-title" tabIndex={-1}>{reference}</h1></div>
      <a className="text-link" href="#admin/orders">Back to orders</a>
    </div>
    {result && <p className={result.kind === 'success' ? 'success-message' : 'form-error'} role={result.kind === 'success' ? 'status' : 'alert'} tabIndex={-1} ref={resultRef}>{result.message}</p>}
    {loadError ? <p className="form-error" role="alert">{loadError}</p>
      : !data || !order ? <p className="admin-loading" role="status">Loading…</p>
      : <div className="admin-editor-layout">
        <div className="admin-request-detail">
          <p className="admin-request-received">Placed <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time> <span className={`admin-status admin-status-${order.stage}`}>{orderStageLabels[order.stage]}</span></p>
          <h2>Customer</h2>
          <dl>
            <dt>Name</dt><dd>{order.customer.fullName}</dd>
            {order.customer.company && <><dt>Company</dt><dd>{order.customer.company}</dd></>}
            <dt>Email</dt><dd><a href={`mailto:${order.customer.email}?subject=${encodeURIComponent(`Your GPEC order ${order.reference}`)}`}>{order.customer.email}</a></dd>
            <dt>Phone</dt><dd><a href={`tel:${order.customer.phone.replace(/[^\d+]/g, '')}`}>{order.customer.phone}</a></dd>
          </dl>
          <h2>{fulfilmentMethodLabels[order.fulfilmentMethod]}</h2>
          {order.fulfilmentMethod === 'delivery'
            ? <p className="admin-request-message">{order.deliveryAddress}</p>
            : <p>The customer collects the order from GPEC.</p>}
          <h2>Items</h2>
          <div className="admin-table-wrap">
            <table className="admin-order-items">
              <thead><tr><th scope="col">Product</th><th scope="col">Unit price</th><th scope="col">Qty</th><th scope="col">Total</th></tr></thead>
              <tbody>{order.items.map((item) => <tr key={item.productId}>
                <th scope="row">{item.name}<small>{item.reference}</small></th>
                <td>{money(item.unitPrice)}</td>
                <td>{item.quantity}</td>
                <td>{money(item.lineTotal)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <dl className="admin-order-totals">
            <dt>Subtotal</dt><dd>{money(order.subtotal)}</dd>
            {order.fulfilmentMethod === 'delivery' && <><dt>Delivery fee</dt><dd>{money(order.deliveryFee)}</dd></>}
            <dt>Payment processing fee</dt><dd>{money(order.paystackFee)}</dd>
            <dt>Total</dt><dd>{money(order.total)}</dd>
          </dl>
          <h2>Payment</h2>
          <dl>
            <dt>Status</dt><dd>{paymentStatusLabels[order.paymentStatus]}</dd>
            {order.paidAt && <><dt>Paid</dt><dd><time dateTime={order.paidAt}>{formatDateTime(order.paidAt)}</time></dd></>}
            <dt>Paystack reference</dt><dd className="admin-mono">{order.paymentReference}</dd>
          </dl>
          <AdminNotes notes={data.notes} onAdd={async (text) => setData(await addOrderNote(reference, text))} onSessionEnded={onSessionEnded} />
        </div>
        <aside className="admin-request-side">
          {order.paymentStatus === 'paid'
            ? <form className="admin-form admin-status-form" onSubmit={handleStatusSubmit}>
              <div className="admin-field">
                <label htmlFor="order-status">Order status</label>
                <select id="order-status" name="fulfilmentStatus" key={order.fulfilmentStatus} defaultValue={order.fulfilmentStatus}>
                  {statusesFor(order.fulfilmentMethod).map((status) => <option key={status} value={status}>{orderStageLabels[status]}</option>)}
                </select>
              </div>
              <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Update status <Arrow /></>}</button>
            </form>
            : <p className="admin-notice">{ordersContent.notPaid}</p>}
          <section className="admin-history" aria-labelledby="admin-order-history-title">
            <h2 id="admin-order-history-title">Status history</h2>
            {data.history.length === 0 ? <p>No changes yet. Paid orders start as “New”.</p>
              : <ol>{data.history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
                <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actor.name} ({entry.actor.email})</p>
                <ul>{entry.changes.map((change) => <li key={change.field}>{orderStageLabels[change.from]} → {orderStageLabels[change.to]}</li>)}</ul>
              </li>)}</ol>}
          </section>
        </aside>
      </div>}
  </section>
}
