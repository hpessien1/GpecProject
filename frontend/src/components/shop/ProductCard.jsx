import Arrow from '../Arrow'

export default function ProductCard({ product, onOpen, onAdd }) {
  function openFromKeyboard(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(product)
    }
  }

  return <article className="shop-product-card">
    <div className="shop-product-preview" role="button" tabIndex="0" onClick={() => onOpen(product)} onKeyDown={openFromKeyboard} aria-label={`View ${product.name} details and full image`}>
      <div className="shop-product-image"><img src={product.image} alt={product.alt} /><span>View details</span></div>
      <div className="shop-product-copy"><p>{product.reference}</p><h2>{product.name}</h2><span className="shop-rule" aria-hidden="true" /><p className="shop-product-description">{product.description}</p><ul>{product.specs.map((specification) => <li key={specification}>{specification}</li>)}</ul></div>
    </div>
    <div className="shop-product-action"><button type="button" className="button shop-add-button" onClick={() => onAdd(product.id)}>Add to order <Arrow /></button></div>
  </article>
}
