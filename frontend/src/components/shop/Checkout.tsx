import Arrow from '../Arrow'
import ProductPrice from './ProductPrice'
import { productImageUrl } from '../../services/productApi'
import type { CartLine, CurrencyInfo } from '../../types'

interface CheckoutProps {
  cartItems: CartLine[]
  currency: CurrencyInfo | null
  itemCount: number
  onGoToCatalogue: () => void
}

// Customers buy in the shop and pay through Paystack's secure page (ECOMMERCE_REQUIREMENTS.md);
// questions go through the contact form. Until GPEC's Paystack account is set up, checkout shows
// the order and says plainly that online payment is not available yet. The checkout form (contact
// details, pickup or delivery, payment) arrives with Paystack.
export default function Checkout({ cartItems, currency, itemCount, onGoToCatalogue }: CheckoutProps) {
  const unavailable = cartItems.filter(({ product }) => !product.inStock)
  return <>
    <div className="shop-order-heading"><div><p className="eyebrow"><span /> Checkout</p><h1>Review<br /><em>your order.</em></h1></div><button type="button" className="text-link" onClick={onGoToCatalogue}>Back to catalogue <Arrow /></button></div>
    {cartItems.length === 0 ? <div className="shop-empty-order"><h2>Your cart is empty.</h2><p>Add products to your cart before checking out.</p><button type="button" className="button button-primary" onClick={onGoToCatalogue}>Browse products <Arrow /></button></div> : <div className="shop-order-layout">
      <section className="shop-checkout-unavailable" aria-labelledby="checkout-unavailable-title">
        <h2 id="checkout-unavailable-title">Online payment is not available yet</h2>
        <p>GPEC is setting up secure online payment through Paystack. Until it is ready, orders cannot be completed on the website. Your cart is kept on this device, so you can come back to it.</p>
        <p>To order now, or to ask about a product, contact GPEC.</p>
        <a className="button button-primary" href="#contact">Contact GPEC <Arrow /></a>
      </section>
      <aside className="shop-order-summary"><p className="eyebrow"><span /> Order summary</p><ul>{cartItems.map(({ product, quantity }) => <li key={product.id}><img src={productImageUrl(product.image)} alt="" /><div><strong>{product.name}</strong><span>{product.reference} · Quantity {quantity}</span><ProductPrice product={product} currency={currency} className="shop-line-price" perItem />{!product.inStock && <span className="shop-stock-label">Out of stock</span>}</div></li>)}</ul><p className="shop-order-count">{itemCount} item{itemCount === 1 ? '' : 's'} selected</p>{unavailable.length > 0 && <p className="shop-stock-note">{unavailable.length === 1 ? 'One product is' : `${unavailable.length} products are`} out of stock and cannot be bought for now. Remove {unavailable.length === 1 ? 'it' : 'them'} from your cart in the catalogue.</p>}</aside>
    </div>}
  </>
}
