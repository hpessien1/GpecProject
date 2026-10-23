import { useCallback, useEffect, useState } from 'react'
import ShopHeader from '../components/shop/ShopHeader'
import ProductCard from '../components/shop/ProductCard'
import Cart from '../components/shop/Cart'
import Checkout from '../components/shop/Checkout'
import PaymentResult from '../components/shop/PaymentResult'
import ProductModal from '../components/shop/ProductModal'
import CatalogueStatus from '../components/shop/CatalogueStatus'
import Pagination from '../components/Pagination'
import { readStoredCart, storeCart } from '../services/cartStorage'
import { fetchProducts } from '../services/productApi'
import { showingRange } from '../utils/paging'
import type { CartEntry, CartLine, CurrencyInfo, Product, StoreMode } from '../types'

const PRODUCTS_PER_PAGE = 6

interface StorePageProps {
  mode: StoreMode
  // In payment mode: the order's Paystack reference.
  paymentReference: string | null
  goHome: () => void
  goToCatalogue: () => void
  goToOrder: () => void
}

export default function StorePage({ mode, paymentReference, goHome, goToCatalogue, goToOrder }: StorePageProps) {
  const [cart, setCart] = useState<CartEntry[]>(readStoredCart)
  // null while loading. The catalogue comes from the API; nothing about products is hard-coded here.
  const [products, setProducts] = useState<Product[] | null>(null)
  // The currency prices are in; null while the server has none configured (no prices shown).
  const [currency, setCurrency] = useState<CurrencyInfo | null>(null)
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
      .then(({ products: loadedProducts, currency: loadedCurrency }) => {
        if (!isCurrent) return
        setProducts(loadedProducts)
        setCurrency(loadedCurrency)
        // Drop cart entries for products that have been archived or removed since they were added.
        setCart((currentCart) => currentCart.filter((item) => loadedProducts.some((product) => product.id === item.id)))
      })
      .catch((error: unknown) => { if (isCurrent) setLoadError(error instanceof Error ? error.message : 'Unable to load products. Please try again.') })
    return () => { isCurrent = false }
  }, [loadAttempt])
  useEffect(() => { storeCart(cart) }, [cart])
  // Only after the server has confirmed the payment (ECOMMERCE_REQUIREMENTS.md, Confirmation).
  const clearCart = useCallback(() => setCart([]), [])
  // A bank-transfer order is placed (unpaid): its cart is done with, so a second visit to checkout
  // does not place it again. Its result page shows how to pay.
  function placedTransferOrder(paymentReference: string) {
    setCart([])
    window.location.hash = `#shop/payment/${paymentReference}`
  }
  useEffect(() => {
    const closeLightboxOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActiveProduct(null) }
    window.addEventListener('keydown', closeLightboxOnEscape)
    return () => window.removeEventListener('keydown', closeLightboxOnEscape)
  }, [])

  // Out-of-stock products cannot be added; the card's button is disabled too. (The checkout
  // refuses them on the server as well.)
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
        {catalogueState !== 'ready' ? <section className="shop-status-page"><CatalogueStatus state={catalogueState} errorMessage={loadError} onRetry={retryLoading} /></section> : <section className="shop-layout" aria-label="Product catalogue and cart"><div id="catalogue-products"><div className="shop-section-heading"><p className="eyebrow"><span /> Available products</p><p>{showingRange(currentPage, PRODUCTS_PER_PAGE, pageProducts.length, catalogue.length, { one: 'product', many: 'products' })}</p></div><div className="shop-product-grid">{pageProducts.map((product) => <ProductCard key={product.id} product={product} currency={currency} onOpen={setActiveProduct} onAdd={addToCart} />)}</div><Pagination label="Product catalogue pages" page={currentPage} totalPages={totalPages} onSelect={selectPage} /></div><Cart cartItems={cartItems} currency={currency} itemCount={itemCount} onUpdateQuantity={updateQuantity} onRemove={(productId) => setCart((currentCart) => currentCart.filter((item) => item.id !== productId))} onGoToOrder={goToOrder} /></section>}
      </>}
      {mode === 'order' && products === null && <section className="shop-order-page"><CatalogueStatus state={loadError ? 'error' : 'loading'} errorMessage={loadError} onRetry={retryLoading} /></section>}
      {mode === 'order' && products !== null && <section className="shop-order-page"><Checkout cartItems={cartItems} currency={currency} itemCount={itemCount} onGoToCatalogue={goToCatalogue} onTransferOrderPlaced={placedTransferOrder} /></section>}
      {mode === 'payment' && paymentReference && <section className="shop-order-page"><PaymentResult paymentReference={paymentReference} onPaid={clearCart} onGoToCatalogue={goToCatalogue} onGoToOrder={goToOrder} /></section>}
    </main>
    <ProductModal product={activeProduct} currency={currency} onClose={() => setActiveProduct(null)} />
  </div>
}
