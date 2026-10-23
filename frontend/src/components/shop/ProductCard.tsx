import { productImageUrl } from '../../services/productApi'
import type { KeyboardEvent } from 'react'
import Arrow from '../Arrow'
import ProductPrice from './ProductPrice'
import type { CurrencyInfo, Product } from '../../types'

interface ProductCardProps {
  product: Product
  currency: CurrencyInfo | null
  onOpen: (product: Product) => void
  onAdd: (productId: string) => void
}

export default function ProductCard({ product, currency, onOpen, onAdd }: ProductCardProps) {
  function openFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(product)
    }
  }

  return <article className="shop-product-card">
    <div className="shop-product-preview" role="button" tabIndex={0} onClick={() => onOpen(product)} onKeyDown={openFromKeyboard} aria-label={`View ${product.name} details and full image`}>
      <div className="shop-product-image"><img src={productImageUrl(product.image)} alt={product.alt} /><span>View details</span></div>
      <div className="shop-product-copy"><p>{product.reference}</p>{product.isPlaceholder && <p className="shop-sample-label">Sample listing · details to be confirmed by GPEC</p>}{!product.inStock && <p className="shop-stock-label">Out of stock</p>}<h2>{product.name}</h2><ProductPrice product={product} currency={currency} /><span className="shop-rule" aria-hidden="true" /><p className="shop-product-description">{product.description}</p><ul>{product.specs.map((specification) => <li key={specification}>{specification}</li>)}</ul></div>
    </div>
    <div className="shop-product-action">{product.inStock
      ? <button type="button" className="button shop-add-button" onClick={() => onAdd(product.id)} aria-label={`Add to cart: ${product.name}`}>Add to cart <Arrow /></button>
      : <button type="button" className="button shop-add-button" disabled aria-label={`Out of stock: ${product.name}`}>Out of stock</button>}</div>
  </article>
}
