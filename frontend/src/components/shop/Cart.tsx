import Arrow from '../Arrow'
import { productImageUrl } from '../../services/productApi'
import type { CartLine } from '../../types'

interface CartProps {
  cartItems: CartLine[]
  itemCount: number
  onUpdateQuantity: (productId: string, change: number) => void
  onRemove: (productId: string) => void
  onGoToOrder: () => void
}

export default function Cart({ cartItems, itemCount, onUpdateQuantity, onRemove, onGoToOrder }: CartProps) {
  return <aside className="shop-cart" id="shop-cart" aria-live="polite">
    <div className="shop-cart-heading"><div><p className="eyebrow"><span /> Your order</p><h2>Cart <span>{itemCount}</span></h2></div></div>
    {cartItems.length === 0 ? <p className="shop-empty-cart">Your cart is empty. Add products from the catalogue to start an order.</p> : <>
      <ul className="shop-cart-list">{cartItems.map(({ product, quantity }) => <li key={product.id}><img src={productImageUrl(product.image)} alt="" /><div><span>{product.reference}</span><strong>{product.name}</strong><div className="quantity-control"><button type="button" onClick={() => onUpdateQuantity(product.id, -1)} aria-label={`Decrease ${product.name} quantity`}>−</button><output aria-label={`${product.name} quantity`}>{quantity}</output><button type="button" onClick={() => onUpdateQuantity(product.id, 1)} disabled={!product.inStock} aria-label={`Increase ${product.name} quantity`}>+</button></div>{!product.inStock && <span className="shop-stock-label">Out of stock</span>}</div><button type="button" className="remove-cart-item" onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name} from cart`}>Remove</button></li>)}</ul>
      <button type="button" className="button button-primary shop-order-button" onClick={onGoToOrder}>Go to checkout <Arrow /></button>
    </>}
  </aside>
}
