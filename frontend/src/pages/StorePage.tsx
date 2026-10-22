import { useEffect, useState } from 'react'
import ShopHeader from '../components/shop/ShopHeader'
import ProductCard from '../components/shop/ProductCard'
import Cart from '../components/shop/Cart'
import Checkout from '../components/shop/Checkout'
import ProductModal from '../components/shop/ProductModal'
import CatalogueStatus from '../components/shop/CatalogueStatus'
import { readStoredCart, storeCart } from '../services/cartStorage'
import { fetchProducts } from '../services/productApi'
import type { CartEntry, CartLine, Product, StoreMode } from '../types'

const PRODUCTS_PER_PAGE = 6

interface StorePageProps {
  mode: StoreMode
  goHome: () => void
  goToCatalogue: () => void
  goToOrder: () => void
}

export default function StorePage({ mode, goHome, goToCatalogue, goToOrder }: StorePageProps) {
  const [cart, setCart] = useState<CartEntry[]>(readStoredCart)
  // null while loading. The catalogue comes from the API; nothing about products is hard-coded here.
  const [products, setProducts] = useState<Product[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [activeProduct, setActiveProduct] = useState<Product | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const catalogue = products ?? []
  const cartItems = cart.map((item) => ({ ...item, product: catalogue.find((product) => product.id === item.id) })).filter((item): item is CartLine => item.product !== undefined)
  // Until the catalogue loads, count the stored cart so the header does not briefly show zero.
  const itemCount = (products ? cartItems : cart).reduce((total, item) => total + item.quantity, 0)
  const totalPages = Math.ceil(catalogue.length / PRODUCTS_PER_PAGE)
  const pageProducts = catalogue.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE)
  const catalogueState = loadError ? 'error' : products === null ? 'loading' : products.length === 0 ? 'empty' : 'ready'

  useEffect(() => {
    let isCurrent = true
    fetchProducts()
      .then((loadedProducts) => {
        if (!isCurrent) return
        setProducts(loadedProducts)
        // Drop cart entries for products that have been archived or removed since they were added.
        setCart((currentCart) => currentCart.filter((item) => loadedProducts.some((product) => product.id === item.id)))
      })
      .catch((error: unknown) => { if (isCurrent) setLoadError(error instanceof Error ? error.message : 'Unable to load products. Please try again.') })
    return () => { isCurrent = false }
  }, [loadAttempt])
  useEffect(() => { storeCart(cart) }, [cart])
  useEffect(() => {
    const closeLightboxOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActiveProduct(null) }
    window.addEventListener('keydown', closeLightboxOnEscape)
    return () => window.removeEventListener('keydown', closeLightboxOnEscape)
  }, [])

  // Out-of-stock products cannot be added; the card's button is disabled too. (The checkout will
  // refuse them on the server as well.)
  function addToCart(productId: string) {
    if (!catalogue.find((product) => product.id === productId)?.inStock) return
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === productId)
      return existingItem ? currentCart.map((item) => item.id === productId ? { ...item, quantity: item.quantity + 1 } : item) : [...currentCart, { id: productId, quantity: 1 }]
    })
  }

  function updateQuantity(productId: string, change: number) {
    if (change > 0 && !catalogue.find((product) => product.id === productId)?.inStock) return
    setCart((currentCart) => currentCart.flatMap((item) => {
      if (item.id !== productId) return [item]
      const quantity = item.quantity + change
      return quantity > 0 ? [{ ...item, quantity }] : []
    }))
  }

  function retryLoading() {
    setLoadError('')
    setLoadAttempt((attempt) => attempt + 1)
  }

  function showCart() { document.getElementById('shop-cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  function selectPage(page: number) {
    setCurrentPage(page)
    document.getElementById('catalogue-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className="shop-shell">
    {/* Moves focus without changing the hash: "#shop-main" would be read as a route and leave the shop. */}
    <a className="skip-link" href="#shop-main" onClick={(event) => { event.preventDefault(); document.getElementById('shop-main')?.focus() }}>Skip to store content</a>
    <ShopHeader mode={mode} itemCount={itemCount} onGoHome={goHome} onGoToCatalogue={goToCatalogue} onShowCart={showCart} />
    <main id="shop-main" tabIndex={-1}>
      {mode === 'catalogue' && <>
        <section className="shop-hero"><div><p className="eyebrow"><span /> GPEC product catalogue</p><h1>Source what<br /><em>your work needs.</em></h1></div><p>Browse GPEC’s electrical, solar, and industrial products and add what you need to your cart. Questions about a product? <a href="#contact">Ask GPEC</a>.</p></section>
        {catalogueState !== 'ready' ? <section className="shop-status-page"><CatalogueStatus state={catalogueState} errorMessage={loadError} onRetry={retryLoading} /></section> : <section className="shop-layout" aria-label="Product catalogue and cart"><div id="catalogue-products"><div className="shop-section-heading"><p className="eyebrow"><span /> Available products</p><p>Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}–{Math.min(currentPage * PRODUCTS_PER_PAGE, catalogue.length)} of {catalogue.length} products</p></div><div className="shop-product-grid">{pageProducts.map((product) => <ProductCard key={product.id} product={product} onOpen={setActiveProduct} onAdd={addToCart} />)}</div><nav className="shop-pagination" aria-label="Product catalogue pages"><button type="button" onClick={() => selectPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button>{Array.from({ length: totalPages }, (_, index) => { const page = index + 1; return <button type="button" key={page} className={page === currentPage ? 'is-active' : ''} aria-current={page === currentPage ? 'page' : undefined} onClick={() => selectPage(page)}>{page}</button> })}<button type="button" onClick={() => selectPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button></nav></div><Cart cartItems={cartItems} itemCount={itemCount} onUpdateQuantity={updateQuantity} onRemove={(productId) => setCart((currentCart) => currentCart.filter((item) => item.id !== productId))} onGoToOrder={goToOrder} /></section>}
      </>}
      {mode === 'order' && products === null && <section className="shop-order-page"><CatalogueStatus state={loadError ? 'error' : 'loading'} errorMessage={loadError} onRetry={retryLoading} /></section>}
      {mode === 'order' && products !== null && <section className="shop-order-page"><Checkout cartItems={cartItems} itemCount={itemCount} onGoToCatalogue={goToCatalogue} /></section>}
    </main>
    <ProductModal product={activeProduct} onClose={() => setActiveProduct(null)} />
  </div>
}
