import { useEffect, useRef } from 'react'
import ProductPrice from './ProductPrice'
import { productImageUrl } from '../../services/productApi'
import type { CurrencyInfo, Product } from '../../types'

interface ProductModalProps {
  product: Product | null
  currency: CurrencyInfo | null
  onClose: () => void
}

// Keyboard-reachable elements only: the backdrop button has tabIndex -1 (mouse only), so it is left out.
const FOCUSABLE = ['a[href]', 'button:not([disabled])', 'input', 'select', 'textarea', '[tabindex]'].map((selector) => `${selector}:not([tabindex="-1"])`).join(', ')

export default function ProductModal({ product, currency, onClose }: ProductModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // While open: focus starts on Close, Tab and Shift+Tab stay inside the dialog, and on closing focus
  // returns to whatever opened it (the product card). Escape is handled by StorePage.
  useEffect(() => {
    if (!product) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    function keepFocusInside(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keepFocusInside)
    return () => {
      document.removeEventListener('keydown', keepFocusInside)
      opener?.focus()
    }
  }, [product])

  if (!product) return null

  return <div className="shop-lightbox" role="dialog" aria-modal="true" aria-label={`${product.name} details`} ref={dialogRef}>
    <button type="button" className="shop-lightbox-backdrop" onClick={onClose} aria-label="Close product details" tabIndex={-1} />
    {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the details scroll; tabIndex lets keyboard users scroll them. */}
    <div className="shop-lightbox-content"><button type="button" className="shop-lightbox-close" onClick={onClose} ref={closeRef}>Close ×</button><div className="shop-lightbox-media"><img src={productImageUrl(product.image)} alt={product.alt} /></div><div className="shop-lightbox-details" tabIndex={0} aria-label="Product details (scrollable)"><p className="eyebrow"><span /> Product details</p><p className="shop-lightbox-reference">{product.reference}</p>{product.isPlaceholder && <p className="shop-sample-label">Sample listing · details to be confirmed by GPEC</p>}{!product.inStock && <p className="shop-stock-label">Out of stock</p>}<h2>{product.name}</h2><ProductPrice product={product} currency={currency} /><span className="shop-rule" aria-hidden="true" /><p>{product.description}</p><h3>Specifications</h3><ul>{product.specs.map((specification) => <li key={specification}>{specification}</li>)}</ul><h3>Not sure it is the right product?</h3><p>Ask GPEC before you buy: describe your installation, or send the part number or ratings you need to match, through the <a href="#contact">contact form</a>.</p></div></div>
  </div>
}
