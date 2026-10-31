import { useEffect, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { unmatchedPaymentsContent } from '../../data/adminContent'
import { ApiError } from '../../services/apiClient'
import { listUnmatchedPayments, resolveUnmatchedPayment } from '../../services/adminApi'
import { formatDateTime } from '../../utils/dates'
import type { UnmatchedPayment } from '../../types'

interface AdminUnmatchedPaymentsProps {
  onSessionEnded: () => void
}

// As Paystack sent it when it is not a currency the browser knows. The amount is in the smallest unit.
function formatAmount({ amount, currency }: UnmatchedPayment) {
  try {
    const format = new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    return format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2))
  } catch {
    return `${amount} (smallest unit) ${currency}`
  }
}

// Completed Paystack payments the website could not match to an order, at the top of the Orders screen
// until staff mark each one dealt with. Shows nothing when there are none.
export default function AdminUnmatchedPayments({ onSessionEnded }: AdminUnmatchedPaymentsProps) {
  const [payments, setPayments] = useState<UnmatchedPayment[]>([])
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    listUnmatchedPayments()
      .then((loaded) => { if (isCurrent) setPayments(loaded.items) })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        if (loadError instanceof ApiError && loadError.status === 401) onSessionEnded()
        else setError(unmatchedPaymentsContent.loadFailed)
      })
    return () => { isCurrent = false }
  }, [onSessionEnded])

  async function handleConfirm() {
    if (!confirming) return
    const reference = confirming
    setConfirming(null)
    setError('')
    try {
      setPayments((await resolveUnmatchedPayment(reference)).items)
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) return onSessionEnded()
      setError(saveError instanceof Error ? saveError.message : unmatchedPaymentsContent.saveFailed)
    }
  }

  if (error && payments.length === 0) return <p className="form-error" role="alert">{error}</p>
  if (payments.length === 0) return null
  return <section className="admin-unmatched" aria-labelledby="admin-unmatched-title">
    <h2 id="admin-unmatched-title">{unmatchedPaymentsContent.title}</h2>
    <p>{unmatchedPaymentsContent.intro}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <ul>{payments.map((payment) => <li key={payment.reference}>
      <div>
        <p><strong>{formatAmount(payment)}</strong> · <time dateTime={payment.createdAt}>{formatDateTime(payment.createdAt)}</time></p>
        <p>{unmatchedPaymentsContent.reasons[payment.reason]}</p>
        <p>{unmatchedPaymentsContent.reference} <span className="admin-mono">{payment.reference}</span></p>
      </div>
      <button className="button button-outline" type="button" onClick={() => setConfirming(payment.reference)}>{unmatchedPaymentsContent.resolve}</button>
    </li>)}</ul>
    <ConfirmDialog open={confirming !== null} title={unmatchedPaymentsContent.confirmTitle} confirmLabel={unmatchedPaymentsContent.resolve} cancelLabel={unmatchedPaymentsContent.cancel} onConfirm={() => void handleConfirm()} onCancel={() => setConfirming(null)}>
      <p>{unmatchedPaymentsContent.confirmText}</p>
    </ConfirmDialog>
  </section>
}
