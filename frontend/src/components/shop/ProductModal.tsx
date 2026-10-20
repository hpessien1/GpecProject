import type { Product } from '../../types'

interface ProductModalProps {
  product: Product | null
  onClose: () => void
}

export default function ProductModal({ product, onClose }: ProductModalProps) {
  if (!product) return null

  return <div className="shop-lightbox" role="dialog" aria-modal="true" aria-label={`${product.name} details`}>
    <button type="button" className="shop-lightbox-backdrop" onClick={onClose} aria-label="Close product details" />
    <div className="shop-lightbox-content"><button type="button" className="shop-lightbox-close" onClick={onClose}>Close ×</button><div className="shop-lightbox-media"><img src={product.image} alt={product.alt} /></div><div className="shop-lightbox-details"><p className="eyebrow"><span /> Product details</p><p className="shop-lightbox-reference">{product.reference}</p><h2>{product.name}</h2><span className="shop-rule" aria-hidden="true" /><p>{product.description}</p><h3>Specifications</h3><ul>{product.specs.map((specification) => <li key={specification}>{specification}</li>)}</ul><h3>Application and selection</h3><p>GPEC reviews operating duty, available installation space, supply conditions, protection requirements, and relevant site constraints before confirming a suitable configuration.</p><p>Share equipment details, drawings, nameplate photos, preferred ratings, and required delivery date in your order enquiry. This helps our team confirm compatibility and identify any accessories, modifications, or replacement parts needed.</p><p>Final scope is checked against approved specifications before supply. Availability, lead time, and final pricing are confirmed by GPEC after the technical review.</p><p className="shop-lightbox-note">Availability and final pricing will be confirmed after GPEC receives your order enquiry.</p></div></div>
  </div>
}
