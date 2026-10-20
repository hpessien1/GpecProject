import type { SubmitEvent } from 'react'
import Arrow from '../Arrow'
import type { CartLine } from '../../types'

interface OrderFormProps {
  cartItems: CartLine[]
  itemCount: number
  orderReference: string
  isSubmitting: boolean
  submissionError: string
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  onGoToCatalogue: () => void
}

export default function OrderForm({ cartItems, itemCount, orderReference, isSubmitting, submissionError, onSubmit, onGoToCatalogue }: OrderFormProps) {
  if (orderReference) return <div className="shop-confirmation" role="status"><p className="eyebrow"><span /> Enquiry confirmed</p><h1>Thank you.<br /><em>We have your request.</em></h1><p>Your enquiry reference is <strong>{orderReference}</strong>. No payment has been taken. A GPEC representative will contact you to confirm availability, pricing, and next steps.</p><button type="button" className="button button-primary" onClick={onGoToCatalogue}>Browse products <Arrow /></button></div>

  return <>
    <div className="shop-order-heading"><div><p className="eyebrow"><span /> Order enquiry</p><h1>Tell us what<br /><em>you need.</em></h1><p>No payment is taken online. GPEC will confirm availability, pricing, and next steps after receiving your enquiry.</p></div><button type="button" className="text-link" onClick={onGoToCatalogue}>Back to catalogue <Arrow /></button></div>
    {cartItems.length === 0 ? <div className="shop-empty-order"><h2>Your cart is empty.</h2><p>Add products before submitting an order enquiry.</p><button type="button" className="button button-primary" onClick={onGoToCatalogue}>Browse products <Arrow /></button></div> : <div className="shop-order-layout">
      <form className="shop-order-form" onSubmit={onSubmit}>
        <div className="field-row"><label>Full name<input name="fullName" required autoComplete="name" placeholder="Your full name" /></label><label>Company <input name="company" autoComplete="organization" placeholder="Company name" /></label></div>
        <div className="field-row"><label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@company.com" /></label><label>Phone number<input name="phone" type="tel" required autoComplete="tel" placeholder="Your phone number" /></label></div>
        <label>Project or delivery location <input name="location" autoComplete="address-level2" placeholder="City, region, or project site" /></label>
        <label>Additional requirements <textarea name="notes" rows={5} placeholder="Technical specifications, required delivery date, drawings, or other notes." /></label>
        <p className="shop-form-note">Submitting creates an order enquiry only. No payment details are requested or stored.</p>
        {submissionError && <p className="shop-form-error" role="alert">{submissionError}</p>}
        <button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting enquiry…' : <>Submit enquiry <Arrow /></>}</button>
      </form>
      <aside className="shop-order-summary"><p className="eyebrow"><span /> Order summary</p><ul>{cartItems.map(({ product, quantity }) => <li key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><span>{product.reference} · Quantity {quantity}</span></div></li>)}</ul><p>{itemCount} item{itemCount === 1 ? '' : 's'} selected</p></aside>
    </div>}
  </>
}
