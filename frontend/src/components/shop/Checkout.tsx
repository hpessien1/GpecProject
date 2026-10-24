import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import SpamTrapField from '../SpamTrapField'
import CatalogueStatus from './CatalogueStatus'
import OrderTotals from './OrderTotals'
import ProductPrice from './ProductPrice'
import { checkoutContent } from '../../data/shopContent'
import { ApiError } from '../../services/apiClient'
import { fetchCheckoutInfo, placeOrder, quoteOrder } from '../../services/checkoutApi'
import { productImageUrl } from '../../services/productApi'
import { formatPrice } from '../../utils/money'
import type { CartLine, CheckoutInfo, CurrencyInfo, FulfilmentMethod, OrderQuote, PaymentMethod } from '../../types'

interface CheckoutProps {
  cartItems: CartLine[]
  currency: CurrencyInfo | null
  itemCount: number
  onGoToCatalogue: () => void
  // A bank-transfer order was placed: the cart is emptied and its result page shows how to pay.
  onTransferOrderPlaced: (paymentReference: string) => void
}

// Customers buy here and pay on Paystack's secure page or by bank transfer to GPEC's account
// (ECOMMERCE_REQUIREMENTS.md); questions go through the contact form. The server prices the order:
// this screen shows its figures and sends only product IDs, quantities, the pickup or delivery choice,
// the payment method, and the customer's details. While no way to pay is open, checkout shows the
// order and says payment is not available yet.
export default function Checkout({ cartItems, currency, itemCount, onGoToCatalogue, onTransferOrderPlaced }: CheckoutProps) {
  const [info, setInfo] = useState<CheckoutInfo | null>(null)
  const [infoError, setInfoError] = useState('')
  const [infoAttempt, setInfoAttempt] = useState(0)
  const [fulfilment, setFulfilment] = useState<FulfilmentMethod>('pickup')
  const [areaId, setAreaId] = useState('')
  const [payment, setPayment] = useState<PaymentMethod | null>(null)
  const [quote, setQuote] = useState<OrderQuote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)

  const unavailable = cartItems.filter(({ product }) => !product.inStock)
  const pickupOnly = cartItems.filter(({ product }) => !product.deliveryAvailable)
  const areas = info?.deliveryAreas ?? []
  const deliveryPossible = areas.length > 0 && pickupOnly.length === 0
  const chosenFulfilment: FulfilmentMethod = deliveryPossible ? fulfilment : 'pickup'
  const basketKey = cartItems.map(({ id, quantity }) => `${id}:${quantity}`).join(',')
  const needsArea = chosenFulfilment === 'delivery' && !areaId
  const methods = info?.paymentMethods ?? []
  // The first open method until the customer picks one.
  const chosenPayment: PaymentMethod = payment && methods.includes(payment) ? payment : methods[0] ?? 'paystack'

  useEffect(() => {
    let isCurrent = true
    fetchCheckoutInfo()
      .then((loaded) => { if (isCurrent) setInfo(loaded) })
      .catch((error: unknown) => { if (isCurrent) setInfoError(error instanceof Error ? error.message : 'Unable to load the checkout.') })
    return () => { isCurrent = false }
  }, [infoAttempt])

  // Ask the server for the order's figures whenever the basket or the delivery choice changes.
  useEffect(() => {
    if (!info?.paymentsAvailable || basketKey === '' || needsArea) return
    let isCurrent = true
    const items = basketKey.split(',').map((entry) => { const [productId, quantity] = entry.split(':'); return { productId, quantity: Number(quantity) } })
    quoteOrder({ items, fulfilmentMethod: chosenFulfilment, deliveryAreaId: chosenFulfilment === 'delivery' ? areaId : null, paymentMethod: chosenPayment })
      .then((loaded) => { if (isCurrent) { setQuote(loaded); setQuoteError('') } })
      .catch((error: unknown) => { if (isCurrent) { setQuote(null); setQuoteError(error instanceof Error ? error.message : 'Unable to work out your total.') } })
    return () => { isCurrent = false }
  }, [info, basketKey, chosenFulfilment, areaId, needsArea, chosenPayment])

  useEffect(() => { errorRef.current?.focus() }, [submitError])

  function retryInfo() {
    setInfoError('')
    setInfoAttempt((attempt) => attempt + 1)
  }

  function chooseFulfilment(method: FulfilmentMethod) {
    setFulfilment(method)
    setQuote(null)
  }

  function choosePayment(method: PaymentMethod) {
    setPayment(method)
    setQuote(null)
  }

  function chooseArea(id: string) {
    setAreaId(id)
    setQuote(null)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const field = (name: string) => String(formData.get(name) ?? '').trim()
    setSubmitError('')
    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const started = await placeOrder({
        items: cartItems.map(({ id, quantity }) => ({ productId: id, quantity })),
        fulfilmentMethod: chosenFulfilment,
        deliveryAreaId: chosenFulfilment === 'delivery' ? areaId : null,
        paymentMethod: chosenPayment,
        fullName: field('fullName'),
        company: field('company'),
        email: field('email'),
        phone: field('phone'),
        deliveryAddress: chosenFulfilment === 'delivery' ? field('deliveryAddress') : '',
        notes: field('notes'),
        website: String(formData.get('website') ?? ''),
      })
      // Off to Paystack's page, or to the transfer instructions; the button stays disabled meanwhile,
      // so the order is not placed twice.
      if (started.paymentMethod === 'paystack') window.location.assign(started.authorizationUrl)
      else onTransferOrderPlaced(started.paymentReference)
    } catch (error) {
      setIsSubmitting(false)
      if (error instanceof ApiError && error.status === 400) setFieldErrors(error.errors)
      setSubmitError(error instanceof Error ? error.message : 'Unable to start the payment. Nothing was charged.')
    }
  }

  const fieldError = (name: string) => fieldErrors[name] && <small className="shop-field-error" id={`checkout-${name}-error`}>{fieldErrors[name]}</small>
  const describedBy = (name: string, hint = false) => [hint && `checkout-${name}-hint`, fieldErrors[name] && `checkout-${name}-error`].filter(Boolean).join(' ') || undefined
  const canPay = unavailable.length === 0 && quote !== null && !isSubmitting

  const summary = <aside className="shop-order-summary" aria-labelledby="checkout-summary-title">
    <p className="eyebrow" id="checkout-summary-title"><span /> Order summary</p>
    <ul>{cartItems.map(({ product, quantity }) => <li key={product.id}><img src={productImageUrl(product.image)} alt="" /><div><strong>{product.name}</strong><span>{product.reference} · Quantity {quantity}</span><ProductPrice product={product} currency={currency} className="shop-line-price" perItem />{!product.inStock && <span className="shop-stock-label">Out of stock</span>}{info?.paymentsAvailable && !product.deliveryAvailable && <span className="shop-pickup-label">Pickup only</span>}</div></li>)}</ul>
    <p className="shop-order-count">{itemCount} item{itemCount === 1 ? '' : 's'} selected</p>
    {unavailable.length > 0 && <p className="shop-stock-note">{unavailable.length === 1 ? 'One product is' : `${unavailable.length} products are`} out of stock and cannot be bought for now. Remove {unavailable.length === 1 ? 'it' : 'them'} from your cart in the catalogue.</p>}
    {info?.paymentsAvailable && (quote
      ? <><OrderTotals quote={quote} fulfilment={chosenFulfilment} paymentMethod={chosenPayment} totalLabel="Total to pay" />{chosenPayment === 'paystack' && <p className="shop-stock-note">{checkoutContent.feeNote}</p>}</>
      : quoteError ? <p className="shop-summary-error" role="alert">{quoteError}</p>
      : needsArea ? <p className="shop-stock-note">Choose your delivery area to see the delivery fee and total.</p>
      : unavailable.length === 0 && <p className="shop-stock-note" role="status">Working out your total…</p>)}
  </aside>

  return <>
    <div className="shop-order-heading"><div><p className="eyebrow"><span /> Checkout</p><h1>Review<br /><em>your order.</em></h1></div><button type="button" className="text-link" onClick={onGoToCatalogue}>Back to catalogue <Arrow /></button></div>
    {cartItems.length === 0 ? <div className="shop-empty-order"><h2>Your cart is empty.</h2><p>Add products to your cart before checking out.</p><button type="button" className="button button-primary" onClick={onGoToCatalogue}>Browse products <Arrow /></button></div>
      : !info ? <CatalogueStatus state={infoError ? 'error' : 'loading'} errorMessage={infoError} onRetry={retryInfo} loadingMessage="Loading the checkout…" errorTitle="The checkout could not be loaded." />
      : !info.paymentsAvailable ? <div className="shop-order-layout">
        <section className="shop-checkout-unavailable" aria-labelledby="checkout-unavailable-title">
          <h2 id="checkout-unavailable-title">Online payment is not available yet</h2>
          <p>GPEC is setting up secure online payment through Paystack. Until it is ready, orders cannot be completed on the website. Your cart is kept on this device, so you can come back to it.</p>
          <p>To order now, or to ask about a product, contact GPEC.</p>
          <a className="button button-primary" href="#contact">Contact GPEC <Arrow /></a>
        </section>
        {summary}
      </div>
      : <div className="shop-order-layout">
        <form className="shop-checkout-form" onSubmit={handleSubmit} aria-labelledby="checkout-form-title">
          <h2 id="checkout-form-title">Your details</h2>
          {info.testMode && chosenPayment === 'paystack' && <p className="shop-test-mode" role="note">{checkoutContent.testMode}</p>}
          <div className="shop-field-row">
            <div className="shop-field"><label htmlFor="checkout-fullName">Full name <span aria-hidden="true">*</span></label><input id="checkout-fullName" name="fullName" required maxLength={120} autoComplete="name" aria-describedby={describedBy('fullName')} />{fieldError('fullName')}</div>
            <div className="shop-field"><label htmlFor="checkout-company">Company (optional)</label><input id="checkout-company" name="company" maxLength={120} autoComplete="organization" aria-describedby={describedBy('company')} />{fieldError('company')}</div>
          </div>
          <div className="shop-field-row">
            <div className="shop-field"><label htmlFor="checkout-email">Email address <span aria-hidden="true">*</span></label><input id="checkout-email" name="email" type="email" required maxLength={254} autoComplete="email" aria-describedby={describedBy('email', true)} /><small id="checkout-email-hint">Your receipt and order confirmation go here.</small>{fieldError('email')}</div>
            <div className="shop-field"><label htmlFor="checkout-phone">Phone number <span aria-hidden="true">*</span></label><input id="checkout-phone" name="phone" type="tel" required maxLength={40} autoComplete="tel" pattern="\+?[\d\s()\-]{7,20}" aria-describedby={describedBy('phone', true)} /><small id="checkout-phone-hint">So GPEC can reach you about the order.</small>{fieldError('phone')}</div>
          </div>

          <fieldset className="shop-fulfilment">
            <legend>How would you like to receive your order? <span aria-hidden="true">*</span></legend>
            <label className="shop-choice"><input type="radio" name="fulfilmentMethod" value="pickup" checked={chosenFulfilment === 'pickup'} onChange={() => chooseFulfilment('pickup')} /><span>Pickup from GPEC<small>No delivery fee. {checkoutContent.pickupAddress}.</small></span></label>
            <label className={`shop-choice${deliveryPossible ? '' : ' is-disabled'}`}><input type="radio" name="fulfilmentMethod" value="delivery" checked={chosenFulfilment === 'delivery'} disabled={!deliveryPossible} onChange={() => chooseFulfilment('delivery')} aria-describedby={deliveryPossible ? undefined : 'checkout-delivery-unavailable'} /><span>Delivery within Nigeria<small>A delivery fee for your area is added.</small></span></label>
            {!deliveryPossible && <p className="shop-field-note" id="checkout-delivery-unavailable">{areas.length === 0 ? checkoutContent.noDeliveryAreas : `GPEC does not deliver ${pickupOnly.map(({ product }) => product.name).join(', ')}, so this order can only be picked up. To have the rest delivered, remove ${pickupOnly.length === 1 ? 'it' : 'them'} from your cart.`}</p>}
          </fieldset>

          {chosenFulfilment === 'pickup' && <p className="shop-field-note">{checkoutContent.pickupNote}</p>}
          {chosenFulfilment === 'delivery' && <>
            <div className="shop-field">
              <label htmlFor="checkout-area">Delivery area <span aria-hidden="true">*</span></label>
              <select id="checkout-area" name="deliveryAreaId" required value={areaId} onChange={(event) => chooseArea(event.target.value)} aria-describedby={describedBy('deliveryAreaId', true)}>
                <option value="" disabled>Choose your area</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}{info.currency && ` (${formatPrice(area.fee, info.currency)})`}</option>)}
              </select>
              <small id="checkout-deliveryAreaId-hint">{areas.find((area) => area.id === areaId)?.description || checkoutContent.areaNotListed}</small>
              {fieldError('deliveryAreaId')}
            </div>
            <div className="shop-field">
              <label htmlFor="checkout-deliveryAddress">Delivery address <span aria-hidden="true">*</span></label>
              <textarea id="checkout-deliveryAddress" name="deliveryAddress" required maxLength={500} rows={3} autoComplete="street-address" placeholder="Street, number, town, and any landmark" aria-describedby={describedBy('deliveryAddress', true)} />
              <small id="checkout-deliveryAddress-hint">{checkoutContent.deliveryNote}</small>
              {fieldError('deliveryAddress')}
            </div>
          </>}

          <fieldset className="shop-fulfilment">
            <legend>How would you like to pay? <span aria-hidden="true">*</span></legend>
            {methods.includes('paystack') && <label className="shop-choice"><input type="radio" name="paymentMethod" value="paystack" checked={chosenPayment === 'paystack'} onChange={() => choosePayment('paystack')} /><span>Pay online with Paystack<small>{checkoutContent.paystackChoice}</small></span></label>}
            {methods.includes('bank_transfer') && <label className="shop-choice"><input type="radio" name="paymentMethod" value="bank_transfer" checked={chosenPayment === 'bank_transfer'} onChange={() => choosePayment('bank_transfer')} /><span>Bank transfer<small>{checkoutContent.transferChoice}</small></span></label>}
          </fieldset>

          <div className="shop-field"><label htmlFor="checkout-notes">Additional requirements or notes (optional)</label><textarea id="checkout-notes" name="notes" maxLength={1000} rows={3} aria-describedby={describedBy('notes')} />{fieldError('notes')}</div>
          <SpamTrapField />

          <p className="shop-checkout-privacy">{checkoutContent.privacy} See our <a href="#privacy" target="_blank" rel="noopener">privacy notice<span className="visually-hidden"> (opens in a new tab)</span></a> and our <a href="#refunds" target="_blank" rel="noopener">refunds, cancellations, and returns policy<span className="visually-hidden"> (opens in a new tab)</span></a>.</p>
          <p className="shop-field-note">{chosenPayment === 'paystack' ? checkoutContent.paystackNote : checkoutContent.transferNote(info.bankTransfer?.payWithinDays ?? 0)}</p>
          {chosenPayment === 'bank_transfer' && info.bankTransfer?.isSample && <p className="shop-test-mode" role="note">{checkoutContent.sampleBank}</p>}
          {submitError && <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{submitError}</p>}
          <button className="button button-primary" type="submit" disabled={!canPay}>{chosenPayment === 'paystack'
            ? isSubmitting ? 'Going to Paystack…' : quote ? <>Pay {formatPrice(quote.total, quote.currency)} with Paystack <Arrow /></> : 'Pay with Paystack'
            : isSubmitting ? 'Placing your order…' : quote ? <>Place order: {formatPrice(quote.total, quote.currency)} by bank transfer <Arrow /></> : 'Place order'}</button>
        </form>
        {summary}
      </div>}
  </>
}
