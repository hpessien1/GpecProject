import { useEffect, useState } from 'react'
import Arrow from '../Arrow'
import { ApiError } from '../../services/apiClient'
import { listAdminProducts } from '../../services/adminApi'
import { formatPrice } from '../../utils/money'
import type { AdminProductsPage, CurrencyInfo } from '../../types'

interface AdminProductListProps {
  currency: CurrencyInfo | null
  onSessionEnded: () => void
}

export default function AdminProductList({ currency, onSessionEnded }: AdminProductListProps) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AdminProductsPage | null>(null)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    listAdminProducts(page)
      .then((loaded) => { if (isCurrent) setResult(loaded) })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        if (loadError instanceof ApiError && loadError.status === 401) onSessionEnded()
        else setError(loadError instanceof Error ? loadError.message : 'Unable to load products.')
      })
    return () => { isCurrent = false }
  }, [page, loadAttempt, onSessionEnded])

  function retry() {
    setError('')
    setLoadAttempt((attempt) => attempt + 1)
  }

  return <section aria-labelledby="admin-products-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> Catalogue</p><h1 id="admin-products-title" tabIndex={-1}>Products</h1></div>
      <a className="button button-primary" href="#admin/new">Add product <Arrow /></a>
    </div>
    {!currency && <p className="admin-notice">Prices cannot be set yet: the shop currency has not been configured.</p>}
    {error ? <div className="shop-status" role="alert"><p>{error}</p><button type="button" className="button button-primary" onClick={retry}>Try again</button></div>
      : !result ? <p className="admin-loading" role="status">Loading products…</p>
      : result.products.length === 0 ? <div className="shop-status" role="status"><p>No products yet. Use “Add product” to create the first one.</p></div>
      : <>
        <p className="admin-count">{result.total} product{result.total === 1 ? '' : 's'}, including archived ones.</p>
        <ul className="admin-product-list">{result.products.map((product) => <li key={product.id} className={product.status === 'archived' ? 'is-archived' : ''}>
          <div className="admin-product-main"><strong>{product.name}</strong><span>{product.reference} · {product.id}</span></div>
          <span className="admin-product-price">{product.price === null || !currency ? 'No price' : formatPrice(product.price, currency)}</span>
          <span className="admin-product-tags">{product.status === 'archived' && <span className="admin-tag">Archived</span>}{product.isPlaceholder && <span className="admin-tag">Sample</span>}</span>
          <a className="admin-edit-link" href={`#admin/products/${encodeURIComponent(product.id)}`} aria-label={`Edit ${product.name}`}>Edit <Arrow /></a>
        </li>)}</ul>
        {result.totalPages > 1 && <nav className="shop-pagination" aria-label="Product list pages">
          <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1}>Previous</button>
          <span>Page {page} of {result.totalPages}</span>
          <button type="button" onClick={() => setPage(page + 1)} disabled={page === result.totalPages}>Next</button>
        </nav>}
      </>}
  </section>
}
