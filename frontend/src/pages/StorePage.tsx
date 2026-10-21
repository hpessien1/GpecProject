import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import ShopHeader from '../components/shop/ShopHeader'
import ProductCard from '../components/shop/ProductCard'
import Cart from '../components/shop/Cart'
import OrderForm from '../components/shop/OrderForm'
import ProductModal from '../components/shop/ProductModal'
import CatalogueStatus from '../components/shop/CatalogueStatus'
import { readStoredCart, storeCart } from '../services/cartStorage'
import { submitOrderEnquiry } from '../services/enquiryApi'
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
  const [orderReference, setOrderReference] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
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

  function addToCart(productId: string) {
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === productId)
      return existingItem ? currentCart.map((item) => item.id === productId ? { ...item, quantity: item.quantity + 1 } : item) : [...currentCart, { id: productId, quantity: 1 }]
    })
  }

  function updateQuantity(productId: string, change: number) {
    setCart((currentCart) => currentCart.flatMap((item) => {
      if (item.id !== productId) return [item]
      const quantity = item.quantity + change
      return quantity > 0 ? [{ ...item, quantity }] : []
    }))
  }

  async function handleOrderSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError('')
    setIsSubmitting(true)
    const form = event.currentTarget
    const formData = new FormData(form)
    const field = (name: string) => String(formData.get(name) ?? '')
    try {
      const response = await submitOrderEnquiry({
        customer: {
          fullName: field('fullName'),
          company: field('company'),
          email: field('email'),
          phone: field('phone'),
        },
        location: field('location'),
        notes: field('notes'),
        items: cartItems.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        website: field('website'),
      })
      setOrderReference(response.reference)
      setCart([])
      form.reset()
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Unable to submit enquiry. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
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
        <section className="shop-hero"><div><p className="eyebrow"><span /> GPEC product catalogue</p><h1>Source what<br /><em>your work needs.</em></h1></div><p>Browse selected electrical, solar, and industrial products. Add items to your order enquiry and GPEC will confirm availability and final pricing.</p></section>
        {catalogueState !== 'ready' ? <section className="shop-status-page"><CatalogueStatus state={catalogueState} errorMessage={loadError} onRetry={retryLoading} /></section> : <section className="shop-layout" aria-label="Product catalogue and cart"><div id="catalogue-products"><div className="shop-section-heading"><p className="eyebrow"><span /> Available products</p><p>Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}–{Math.min(currentPage * PRODUCTS_PER_PAGE, catalogue.length)} of {catalogue.length} products</p></div><div className="shop-product-grid">{pageProducts.map((product) => <ProductCard key={product.id} product={product} onOpen={setActiveProduct} onAdd={addToCart} />)}</div><nav className="shop-pagination" aria-label="Product catalogue pages"><button type="button" onClick={() => selectPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button>{Array.from({ length: totalPages }, (_, index) => { const page = index + 1; return <button type="button" key={page} className={page === currentPage ? 'is-active' : ''} aria-current={page === currentPage ? 'page' : undefined} onClick={() => selectPage(page)}>{page}</button> })}<button type="button" onClick={() => selectPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button></nav></div><Cart cartItems={cartItems} itemCount={itemCount} onUpdateQuantity={updateQuantity} onRemove={(productId) => setCart((currentCart) => currentCart.filter((item) => item.id !== productId))} onGoToOrder={goToOrder} /></section>}
      </>}
      {mode === 'order' && products === null && <section className="shop-order-page"><CatalogueStatus state={loadError ? 'error' : 'loading'} errorMessage={loadError} onRetry={retryLoading} /></section>}
      {mode === 'order' && products !== null && <section className="shop-order-page"><OrderForm cartItems={cartItems} itemCount={itemCount} orderReference={orderReference} isSubmitting={isSubmitting} submissionError={submissionError} onSubmit={handleOrderSubmit} onGoToCatalogue={goToCatalogue} /></section>}
    </main>
    <ProductModal product={activeProduct} onClose={() => setActiveProduct(null)} />
  </div>
}
