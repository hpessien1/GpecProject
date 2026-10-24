import { useEffect, useState } from 'react'
import Arrow from '../Arrow'
import Pagination from '../Pagination'
import { productCategoryLabels } from '../../data/landingContent'
import { ApiError } from '../../services/apiClient'
import { listAdminProducts } from '../../services/adminApi'
import { formatPrice } from '../../utils/money'
import { showingRange } from '../../utils/paging'
import { useRememberedState } from '../../utils/rememberedState'
import { isInStock } from '../../utils/stock'
import type { AdminProductsPage, CurrencyInfo } from '../../types'

interface AdminProductListProps {
  currency: CurrencyInfo | null
  onSessionEnded: () => void
}

export default function AdminProductList({ currency, onSessionEnded }: AdminProductListProps) {
  // Kept while staff open a product and come back.
  const [page, setPage] = useRememberedState('products', 1)
  const [result, setResult] = useState<AdminProductsPage | null>(null)
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    listAdminProducts(page)
      .then((loaded) => {
        if (!isCurrent) return
        // A remembered page that no longer exists: show the last one rather than an empty list.
        if (page > loaded.totalPages) setPage(loaded.totalPages)
        else setResult(loaded)
      })
      .catch((loadError: unknown) => {
        if (!isCurrent) return
        if (loadError instanceof ApiError && loadError.status === 401) onSessionEnded()
        else setError(loadError instanceof Error ? loadError.message : 'Unable to load products.')
      })
    return () => { isCurrent = false }
  }, [page, loadAttempt, onSessionEnded, setPage])

  // Back to the top of the list, as a new page would load.
  function choosePage(nextPage: number) {
    setPage(nextPage)
    document.getElementById('admin-products-title')?.focus()
  }

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
        <p className="admin-count">{showingRange(page, result.pageSize, result.products.length, result.total, { one: 'product', many: 'products' })}, including archived ones.</p>
        <ul className="admin-product-list">{result.products.map((product) => <li key={product.id} className={product.status === 'archived' ? 'is-archived' : ''}>
          <div className="admin-product-main"><strong>{product.name}</strong><span>{product.reference} · {product.id} · {product.category ? productCategoryLabels[product.category] : 'No category'}</span></div>
          <span className="admin-product-price">{product.price === null || !currency ? 'No price' : formatPrice(product.price, currency)}</span>
          <span className="admin-product-tags">{product.status === 'archived' && <span className="admin-tag">Archived</span>}{isInStock(product) || <span className="admin-tag">Out of stock</span>}{product.isPlaceholder && <span className="admin-tag">Sample</span>}{product.category === null && <span className="admin-tag">Needs a category</span>}</span>
          <a className="admin-edit-link" href={`#admin/products/${encodeURIComponent(product.id)}`} aria-label={`Edit ${product.name}`}>Edit <Arrow /></a>
        </li>)}</ul>
        {result.totalPages > 1 && <Pagination label="Product list pages" page={page} totalPages={result.totalPages} onSelect={choosePage} />}
      </>}
  </section>
}
