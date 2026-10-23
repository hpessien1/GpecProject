import { formatPrice } from '../../utils/money'
import type { OrderQuote, PaymentMethod } from '../../types'

interface OrderTotalsProps {
  quote: OrderQuote
  fulfilment: 'pickup' | 'delivery'
  // A bank transfer has no Paystack fee, so no fee line.
  paymentMethod: PaymentMethod
  // "Total to pay" before paying, "Total paid" after.
  totalLabel: string
}

// The amounts as the server worked them out: the browser never adds anything up itself.
export default function OrderTotals({ quote, fulfilment, paymentMethod, totalLabel }: OrderTotalsProps) {
  const money = (amount: number) => formatPrice(amount, quote.currency)
  return <dl className="shop-order-totals">
    <dt>Subtotal</dt><dd>{money(quote.subtotal)}</dd>
    {fulfilment === 'delivery' && <><dt>Delivery{quote.deliveryAreaName && <small>{quote.deliveryAreaName}</small>}</dt><dd>{money(quote.deliveryFee)}</dd></>}
    {paymentMethod === 'paystack' && <><dt>Payment processing fee</dt><dd>{money(quote.paystackFee)}</dd></>}
    <dt className="shop-order-total">{totalLabel}</dt><dd className="shop-order-total">{money(quote.total)}</dd>
  </dl>
}
