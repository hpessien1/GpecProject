import { useEffect, useState } from 'react'
import Arrow from '../Arrow'
import CatalogueStatus from './CatalogueStatus'
import OrderTotals from './OrderTotals'
import TransferInstructions from './TransferInstructions'
import { checkoutContent, paymentResultContent } from '../../data/shopContent'
import { checkPayment } from '../../services/checkoutApi'
import { formatPrice } from '../../utils/money'
import type { PaymentResult as PaymentResultData } from '../../types'

interface PaymentResultProps {
  // The order's Paystack reference, from the address Paystack sent the customer back to.
  paymentReference: string
  // Called once the server has confirmed the payment: only then is the cart emptied.
  onPaid: () => void
  onGoToCatalogue: () => void
  onGoToOrder: () => void
}

// While Paystack has not confirmed yet, look again a few times on its own before leaving it to the
// customer's "Check again".
const AUTOMATIC_CHECKS = 3
const CHECK_INTERVAL_MS = 4000

export default function PaymentResult({ paymentReference, onPaid, onGoToCatalogue, onGoToOrder }: PaymentResultProps) {
  const [result, setResult] = useState<PaymentResultData | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    const timer = window.setTimeout(() => {
      checkPayment(paymentReference)
        .then((loaded) => {
          if (!isCurrent) return
          setError('')
          setResult(loaded)
          if (loaded.paymentStatus === 'paid') onPaid()
          // Only Paystack confirms on its own; a transfer waits for GPEC staff.
          else if (loaded.paymentStatus === 'pending_payment' && loaded.paymentMethod === 'paystack' && attempt < AUTOMATIC_CHECKS) setAttempt((current) => current + 1)
        })
        .catch((checkError: unknown) => { if (isCurrent) setError(checkError instanceof Error ? checkError.message : 'Unable to check your payment.') })
    }, attempt === 0 ? 0 : CHECK_INTERVAL_MS)
    return () => {
      isCurrent = false
      window.clearTimeout(timer)
    }
  }, [paymentReference, attempt, onPaid])

  function checkAgain() {
    setError('')
    setAttempt((current) => current + 1)
  }

  const heading = <div className="shop-order-heading"><div><p className="eyebrow"><span /> Payment</p><h1>{result?.paymentStatus === 'paid' ? <>Order<br /><em>confirmed.</em></> : <>Your<br /><em>payment.</em></>}</h1></div><button type="button" className="text-link" onClick={onGoToCatalogue}>Back to catalogue <Arrow /></button></div>
  if (!result) return <>{heading}<CatalogueStatus state={error ? 'error' : 'loading'} errorMessage={error} onRetry={checkAgain} loadingMessage={paymentResultContent.checking} errorTitle="Your payment could not be checked." /></>

  const money = (amount: number) => formatPrice(amount, result.currency)
  return <>
    {heading}
    <div className="shop-order-layout">
      <section className="shop-checkout-unavailable" aria-labelledby="payment-result-title" aria-live="polite">
        {result.paymentStatus === 'paid' ? <>
          <h2 id="payment-result-title">{paymentResultContent.paidTitle}</h2>
          <p>Your order reference is <strong>{result.reference}</strong>. {paymentResultContent.paidEmail}</p>
          {result.fulfilmentMethod === 'pickup'
            ? <p>Pickup from GPEC at <strong>{checkoutContent.pickupAddress}</strong>. {checkoutContent.pickupNote}</p>
            : <p>Delivery{result.deliveryAreaName && <> to <strong>{result.deliveryAreaName}</strong></>}. {checkoutContent.deliveryNote}</p>}
          <a className="button button-primary" href="#contact">Questions? Contact GPEC <Arrow /></a>
        </> : result.paymentMethod === 'bank_transfer' && result.paymentStatus === 'failed' ? <>
          <h2 id="payment-result-title">{paymentResultContent.transferClosedTitle}</h2>
          <p>{paymentResultContent.transferClosedText} Your order reference is <strong>{result.reference}</strong>.</p>
          <a className="button button-primary" href="#contact">Contact GPEC <Arrow /></a>
        </> : result.paymentMethod === 'bank_transfer' && result.bankTransfer ? <TransferInstructions paymentReference={paymentReference} result={{ ...result, bankTransfer: result.bankTransfer }} onReported={setResult} />
        : result.paymentStatus === 'failed' ? <>
          <h2 id="payment-result-title">{paymentResultContent.failedTitle}</h2>
          <p>{paymentResultContent.failedText}</p>
          <button type="button" className="button button-primary" onClick={onGoToOrder}>Return to checkout <Arrow /></button>
        </> : <>
          <h2 id="payment-result-title">{paymentResultContent.pendingTitle}</h2>
          <p>{paymentResultContent.pendingText}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="shop-payment-actions"><button type="button" className="button button-primary" onClick={checkAgain}>Check again</button><button type="button" className="text-link" onClick={onGoToOrder}>Return to checkout <Arrow /></button></div>
        </>}
      </section>
      <aside className="shop-order-summary" aria-labelledby="payment-summary-title">
        <p className="eyebrow" id="payment-summary-title"><span /> Order {result.reference}</p>
        <ul>{result.items.map((item) => <li key={item.productId}><div><strong>{item.name}</strong><span>{item.reference} · Quantity {item.quantity}</span><p className="shop-line-price">{money(item.unitPrice)} each</p></div></li>)}</ul>
        <OrderTotals quote={result} fulfilment={result.fulfilmentMethod} paymentMethod={result.paymentMethod} totalLabel={result.paymentStatus === 'paid' ? 'Total paid' : 'Total'} />
      </aside>
    </div>
  </>
}
