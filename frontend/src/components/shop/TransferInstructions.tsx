import { useEffect, useRef, useState } from 'react'
import { checkoutContent, paymentResultContent } from '../../data/shopContent'
import { reportTransferSent } from '../../services/checkoutApi'
import { formatDateTime } from '../../utils/dates'
import { formatPrice } from '../../utils/money'
import type { PaymentResult } from '../../types'

interface TransferInstructionsProps {
  paymentReference: string
  result: PaymentResult & { bankTransfer: NonNullable<PaymentResult['bankTransfer']> }
  onReported: (result: PaymentResult) => void
}

// How to pay an unpaid bank-transfer order: GPEC's Nigerian account (bank, account name, 10-digit
// account number), the exact amount, and the order reference as the narration, as the order recorded
// them. "I have sent the transfer" lets staff know; only staff can confirm the money arrived.
export default function TransferInstructions({ paymentReference, result, onReported }: TransferInstructionsProps) {
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const resultRef = useRef<HTMLParagraphElement>(null)
  const bank = result.bankTransfer
  const reported = bank.reportedAt !== null

  useEffect(() => { if (reported || error) resultRef.current?.focus() }, [reported, error])

  async function report() {
    setError('')
    setIsSending(true)
    try {
      onReported(await reportTransferSent(paymentReference))
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Unable to let GPEC know. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  return <>
    <h2 id="payment-result-title">{paymentResultContent.transferTitle}</h2>
    <p>Your order reference is <strong>{result.reference}</strong>. {paymentResultContent.transferText}</p>
    {bank.isSample && <p className="shop-test-mode" role="note">{checkoutContent.sampleBank}</p>}
    <dl className="shop-transfer-details">
      <dt>Bank</dt><dd>{bank.bankName}</dd>
      <dt>Account name</dt><dd>{bank.accountName}</dd>
      <dt>Account number</dt><dd className="shop-transfer-number">{bank.accountNumber}</dd>
      <dt>Amount</dt><dd>{formatPrice(result.total, result.currency)}</dd>
      <dt>Narration</dt><dd className="shop-transfer-number">{result.reference}</dd>
      <dt>Pay by</dt><dd><time dateTime={bank.payBy}>{formatDateTime(bank.payBy)}</time></dd>
    </dl>
    {bank.instructions && <p>{bank.instructions}</p>}
    <p><strong>{paymentResultContent.transferNotice}</strong></p>
    {reported
      ? <p className="success-message" role="status" tabIndex={-1} ref={resultRef}>{paymentResultContent.transferReportedText}</p>
      : <>
        {error && <p className="form-error" role="alert" tabIndex={-1} ref={resultRef}>{error}</p>}
        <button type="button" className="button button-primary" onClick={report} disabled={isSending}>{isSending ? 'Letting GPEC know…' : 'I have sent the transfer'}</button>
      </>}
  </>
}
