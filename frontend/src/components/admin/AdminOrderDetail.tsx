import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import AdminNotes from './AdminNotes'
import AdminOlderEntries from './AdminOlderEntries'
import ConfirmPasswordField from './ConfirmPasswordField'
import { fulfilmentMethodLabels, orderStageLabels, ordersContent, paymentMethodLabels, paymentStatusLabels } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { addOrderNote, checkOrderPayment, closeUnpaidTransfer, confirmTransferReceived, getOlderOrderHistory, getOlderOrderNotes, getOrder, setOrderStatus } from '../../services/adminApi'
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

// The statuses the customer can be emailed about (backend services/adminOrders.ts, CUSTOMER_UPDATE_STATUSES).
type CustomerUpdateStatus = 'ready_for_pickup' | 'out_for_delivery' | 'cancelled'
function isCustomerUpdate(status: FulfilmentStatus): status is CustomerUpdateStatus {
  return status === 'ready_for_pickup' || status === 'out_for_delivery' || status === 'cancelled'
}

interface NotifyCustomerFieldProps {
  id: string
  emailOn: boolean
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}

// "Tell the customer by email", ticked by default; or, while email is not set up, a note saying so.
function NotifyCustomerField({ id, emailOn, hint, checked, onChange }: NotifyCustomerFieldProps) {
  if (!emailOn) return <p className="admin-notice">{ordersContent.emailOff}</p>
  return <div className="admin-field admin-checkbox">
    <label><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-describedby={`${id}-hint`} /> {ordersContent.notifyLabel}</label>
    <small id={`${id}-hint`}>{hint}</small>
  </div>
}

// Everything about one order: who, what, how much, pickup or delivery, payment, the fulfilment
// status staff move along, who changed it when, and staff notes.
export default function AdminOrderDetail({ reference, onSessionEnded }: AdminOrderDetailProps) {
  const [data, setData] = useState<AdminOrderResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error', message: string } | null>(null)
  // The status chosen in the list but not saved yet (null: the order's own), and the two "Tell the
  // customer by email" boxes, ticked by default.
  const [chosenStatus, setChosenStatus] = useState<FulfilmentStatus | null>(null)
  const [notifyOnStatus, setNotifyOnStatus] = useState(true)
  const [notifyOnClose, setNotifyOnClose] = useState(true)
  // The password "transfer received" needs, refused by the server.
  const [passwordError, setPasswordError] = useState('')
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
    // Sent only where the box was offered; the server emails only about these statuses anyway.
    const notify = data.emailOn && isCustomerUpdate(status) ? notifyOnStatus : undefined
    setResult(null)
    setIsSaving(true)
    try {
      setData(await setOrderStatus(reference, status, notify))
      setChosenStatus(null)
      setNotifyOnStatus(true)
      setResult({ kind: 'success', message: `Order moved to ${orderStageLabels[status]}.${notify ? ' The customer has been emailed.' : ''}` })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to update the order.' })
    } finally {
      setIsSaving(false)
    }
  }

  // A bank transfer staff have checked for in GPEC's account: it arrived, or it never did. The confirm
  // checkbox and the password make "received" a deliberate statement by the admin themselves; "not
  // received" asks once more. password: only for "received".
  async function settleTransfer(received: boolean, password = '') {
    if (!received && !window.confirm('Close this order as not received? Do this only if the transfer has not arrived. It cannot be undone.')) return
    setResult(null)
    setPasswordError('')
    setIsSaving(true)
    const notify = !received && data?.emailOn === true && notifyOnClose
    try {
      setData(await (received ? confirmTransferReceived(reference, password) : closeUnpaidTransfer(reference, notify)))
      setResult({ kind: 'success', message: received ? `Transfer confirmed: the order is paid${data?.emailOn ? ', and the customer has been emailed' : ''}.` : `Order closed as not received.${notify ? ' The customer has been emailed.' : ''}` })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      if (error instanceof ApiError) setPasswordError(error.errors.password ?? '')
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to update the payment.' })
    } finally {
      setIsSaving(false)
    }
  }

  function handleTransferReceived(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    void settleTransfer(true, String(new FormData(event.currentTarget).get('password') ?? ''))
  }

  function handleTransferMissing(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    void settleTransfer(false)
  }

  // A Paystack order not paid yet: ask Paystack, which alone decides whether it changes.
  async function handlePaymentCheck(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    setIsSaving(true)
    try {
      const { paymentCheck, ...updated } = await checkOrderPayment(reference)
      setData(updated)
      setResult({ kind: paymentCheck === 'mismatch' ? 'error' : 'success', message: ordersContent.paystackCheck.outcomes[paymentCheck](updated.emailOn) })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return onSessionEnded()
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to check the payment with Paystack.' })
    } finally {
      setIsSaving(false)
    }
  }

  const order = data?.order
  const money = (amount: number) => order ? formatPrice(amount, order.currency) : ''
  const selectedStatus = chosenStatus ?? order?.fulfilmentStatus ?? 'new'
  // The status the customer would be emailed about, if the one chosen is a change worth telling them.
  const statusUpdate = order && selectedStatus !== order.fulfilmentStatus && isCustomerUpdate(selectedStatus) ? selectedStatus : null
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
            ? <>{order.deliveryAreaName && <p>Area: <strong>{order.deliveryAreaName}</strong></p>}<p className="admin-request-message">{order.deliveryAddress}</p></>
            : <p>The customer collects the order from GPEC.</p>}
          {order.customerNotes && <><h2>Customer notes</h2><p className="admin-request-message">{order.customerNotes}</p></>}
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
            {order.paymentMethod === 'paystack' && <><dt>Payment processing fee</dt><dd>{money(order.paystackFee)}</dd></>}
            <dt>Total</dt><dd>{money(order.total)}</dd>
          </dl>
          <h2>Payment</h2>
          <dl>
            <dt>Method</dt><dd>{paymentMethodLabels[order.paymentMethod]}</dd>
            <dt>Status</dt><dd>{order.paymentMethod === 'bank_transfer' && order.paymentStatus === 'failed' ? 'Closed as not received' : paymentStatusLabels[order.paymentStatus]}</dd>
            {order.paidAt && <><dt>Paid</dt><dd><time dateTime={order.paidAt}>{formatDateTime(order.paidAt)}</time></dd></>}
            {order.paymentMethod === 'paystack' && <><dt>Paystack reference</dt><dd className="admin-mono">{order.paymentReference}</dd></>}
            {order.transferReportedAt && <><dt>Reported sent</dt><dd><time dateTime={order.transferReportedAt}>{formatDateTime(order.transferReportedAt)}</time></dd></>}
          </dl>
          {order.bankTransfer && <>
            <h2>Bank details given</h2>
            {order.bankTransfer.isSample && <p className="admin-notice">Sample details (testing only): this customer was told not to send money.</p>}
            <dl>
              <dt>Bank</dt><dd>{order.bankTransfer.bankName}</dd>
              <dt>Account name</dt><dd>{order.bankTransfer.accountName}</dd>
              <dt>Account number</dt><dd className="admin-mono">{order.bankTransfer.accountNumber}</dd>
              <dt>Narration</dt><dd className="admin-mono">{order.reference}</dd>
            </dl>
          </>}
          <AdminNotes notes={data.notes} cursor={data.notesCursor} loadOlder={(before) => getOlderOrderNotes(reference, before)} onAdd={async (text) => setData(await addOrderNote(reference, text))} onSessionEnded={onSessionEnded} />
        </div>
        <aside className="admin-request-side">
          {order.paymentStatus === 'paid'
            ? <form className="admin-form admin-status-form" onSubmit={handleStatusSubmit}>
              <div className="admin-field">
                <label htmlFor="order-status">Order status</label>
                <select id="order-status" name="fulfilmentStatus" value={selectedStatus} onChange={(event) => { if (isFulfilmentStatus(event.target.value)) setChosenStatus(event.target.value) }}>
                  {statusesFor(order.fulfilmentMethod).map((status) => <option key={status} value={status}>{orderStageLabels[status]}</option>)}
                </select>
              </div>
              {statusUpdate && <NotifyCustomerField id="order-status-notify" emailOn={data.emailOn} hint={ordersContent.notifyHints[statusUpdate]} checked={notifyOnStatus} onChange={setNotifyOnStatus} />}
              <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Update status <Arrow /></>}</button>
            </form>
            : order.paymentMethod === 'bank_transfer' && order.paymentStatus === 'pending_payment'
              // Two opposite answers, each in its own box with its own button, so the email box
              // clearly belongs to closing the order.
              ? <section className="admin-transfer-actions" aria-labelledby="admin-transfer-title">
                <h2 id="admin-transfer-title">{ordersContent.transferQuestion}</h2>
                <p className="admin-notice">{ordersContent.transferWaiting(money(order.total), order.reference)}</p>
                <form className="admin-form admin-transfer-choice" aria-labelledby="admin-transfer-received-title" onSubmit={handleTransferReceived}>
                  <h3 id="admin-transfer-received-title">{ordersContent.transferReceived.title}</h3>
                  <p>{ordersContent.transferReceived.text(data.emailOn)}</p>
                  <div className="admin-field admin-checkbox">
                    <label><input type="checkbox" name="checked" required /> I have checked GPEC’s bank account: {money(order.total)} arrived with the narration {order.reference}.</label>
                  </div>
                  <ConfirmPasswordField id="transfer-received-password" hint={ordersContent.transferReceived.passwordHint} error={passwordError} />
                  <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : <>Confirm transfer received <Arrow /></>}</button>
                </form>
                <form className="admin-form admin-transfer-choice" aria-labelledby="admin-transfer-missing-title" onSubmit={handleTransferMissing}>
                  <h3 id="admin-transfer-missing-title">{ordersContent.transferMissing.title}</h3>
                  <p>{ordersContent.transferMissing.text}</p>
                  <NotifyCustomerField id="transfer-close-notify" emailOn={data.emailOn} hint={ordersContent.notifyHints.transfer_not_received} checked={notifyOnClose} onChange={setNotifyOnClose} />
                  <button className="button button-outline" type="submit" disabled={isSaving}>{ordersContent.transferMissing.button}</button>
                </form>
              </section>
            : order.paymentMethod === 'paystack' && data.paystackOn
              ? <section className="admin-transfer-actions" aria-labelledby="admin-payment-check-title">
                <h2 id="admin-payment-check-title">{ordersContent.paystackCheck.question}</h2>
                <p className="admin-notice">{ordersContent.notPaid}</p>
                <form className="admin-form admin-transfer-choice" aria-labelledby="admin-payment-check-form-title" onSubmit={handlePaymentCheck}>
                  <h3 id="admin-payment-check-form-title">{ordersContent.paystackCheck.title}</h3>
                  <p>{ordersContent.paystackCheck.text}</p>
                  <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? ordersContent.paystackCheck.checking : <>{ordersContent.paystackCheck.button} <Arrow /></>}</button>
                </form>
              </section>
            : <p className="admin-notice">{order.paymentMethod === 'bank_transfer' ? ordersContent.transferClosed : ordersContent.notPaid}</p>}
          <section className="admin-history" aria-labelledby="admin-order-history-title">
            <h2 id="admin-order-history-title">History</h2>
            <AdminOlderEntries kind="history" newest={data.history} cursor={data.historyCursor} loadOlder={(before) => getOlderOrderHistory(reference, before)} onSessionEnded={onSessionEnded}>
              {(history) => history.length === 0 ? <p>No changes yet. Paid orders start as “New”.</p>
                : <ol>{history.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>
                  <p className="admin-history-meta"><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time> · {entry.actor.name} ({entry.actor.email})</p>
                  <ul>{entry.action === 'order.payment'
                    // On a Paystack order, staff asked Paystack; on a transfer, staff decided.
                    ? entry.changes.map((change) => <li key={change.field}>Payment: {paymentStatusLabels[change.from]} → {order.paymentMethod === 'bank_transfer' && change.to === 'failed' ? 'Closed as not received' : paymentStatusLabels[change.to]}{order.paymentMethod === 'paystack' && ` (${ordersContent.paystackCheck.checkedNote})`}</li>)
                    : entry.changes.map((change) => <li key={change.field}>{orderStageLabels[change.from]} → {orderStageLabels[change.to]}</li>)}
                    {entry.customerEmailed && <li className="admin-history-emailed">{ordersContent.emailed}</li>}</ul>
                </li>)}</ol>}
            </AdminOlderEntries>
          </section>
        </aside>
      </div>}
  </section>
}
