import Arrow from '../Arrow'

interface CatalogueStatusProps {
  state: 'loading' | 'error' | 'empty'
  errorMessage: string
  onRetry: () => void
}

// Shown in place of the catalogue (and the order page) until products have loaded.
export default function CatalogueStatus({ state, errorMessage, onRetry }: CatalogueStatusProps) {
  if (state === 'loading') return <div className="shop-status" role="status"><p>Loading products…</p></div>
  if (state === 'error') return <div className="shop-status" role="alert"><h2>Products could not be loaded.</h2><p>{errorMessage}</p><button type="button" className="button button-primary" onClick={onRetry}>Try again <Arrow /></button></div>
  return <div className="shop-status" role="status"><h2>No products are listed yet.</h2><p>GPEC is preparing its product catalogue. Tell us what you need and we will help you find it.</p><a className="button button-primary" href="#contact">Contact GPEC <Arrow /></a></div>
}
