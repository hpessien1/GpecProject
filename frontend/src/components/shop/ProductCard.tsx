import type { KeyboardEvent } from 'react'
import Arrow from '../Arrow'
import type { Product } from '../../types'

interface ProductCardProps {
  product: Product
  onOpen: (product: Product) => void
  onAdd: (productId: string) => void
}

export default function ProductCard({ product, onOpen, onAdd }: ProductCardProps) {
  function openFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(product)
    }
  }

  return <article className="shop-product-card">
    <div className="shop-product-preview" role="button" tabIndex={0} onClick={() => onOpen(product)} onKeyDown={openFromKeyboard} aria-label={`View ${product.name} details and full image`}>
      <div className="shop-product-image"><img src={product.image} alt={product.alt} /><span>View details</span></div>
      <div className="shop-product-copy"><p>{product.reference}</p>{product.isPlaceholder && <p className="shop-sample-label">Sample listing · details to be confirmed by GPEC</p>}<h2>{product.name}</h2><span className="shop-rule" aria-hidden="true" /><p className="shop-product-description">{product.description}</p><ul>{product.specs.map((specification) => <li key={specification}>{specification}</li>)}</ul></div>
    </div>
    <div className="shop-product-action"><button type="button" className="button shop-add-button" onClick={() => onAdd(product.id)}>Add to order <Arrow /></button></div>
  </article>
}
