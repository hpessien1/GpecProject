import Arrow from '../Arrow'

interface CatalogueStatusProps {
  state: 'loading' | 'error' | 'empty'
  errorMessage: string
  onRetry: () => void
  // For the checkout and payment screens, which load something other than products.
  loadingMessage?: string
  errorTitle?: string
}

// Shown in place of the catalogue (and the order and payment pages) until their data has loaded.
export default function CatalogueStatus({ state, errorMessage, onRetry, loadingMessage = 'Loading products…', errorTitle = 'Products could not be loaded.' }: CatalogueStatusProps) {
  if (state === 'loading') return <div className="shop-status" role="status"><p>{loadingMessage}</p></div>
  if (state === 'error') return <div className="shop-status" role="alert"><h2>{errorTitle}</h2><p>{errorMessage}</p><button type="button" className="button button-primary" onClick={onRetry}>Try again <Arrow /></button></div>
  return <div className="shop-status" role="status"><h2>No products are listed yet.</h2><p>GPEC is preparing its product catalogue. Tell us what you need and we will help you find it.</p><a className="button button-primary" href="#contact">Contact GPEC <Arrow /></a></div>
}
