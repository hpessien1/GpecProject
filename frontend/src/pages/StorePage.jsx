import { useEffect, useState } from 'react'
import { CART_STORAGE_KEY, catalogueProducts, readStoredCart } from '../data/catalogueProducts'
import ShopHeader from '../components/shop/ShopHeader'
import ProductCard from '../components/shop/ProductCard'
import Cart from '../components/shop/Cart'
import OrderForm from '../components/shop/OrderForm'
import ProductModal from '../components/shop/ProductModal'
import { submitOrderEnquiry } from '../services/enquiryApi'

const PRODUCTS_PER_PAGE = 6

export default function StorePage({ mode, goHome, goToCatalogue, goToOrder }) {
  const [cart, setCart] = useState(readStoredCart)
  const [activeProduct, setActiveProduct] = useState(null)
  const [orderReference, setOrderReference] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState('')
  const cartItems = cart.map((item) => ({ ...item, product: catalogueProducts.find((product) => product.id === item.id) })).filter((item) => item.product)
  const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0)
  const totalPages = Math.ceil(catalogueProducts.length / PRODUCTS_PER_PAGE)
  const pageProducts = catalogueProducts.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE)

  useEffect(() => { window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)) }, [cart])
  useEffect(() => {
    const closeLightboxOnEscape = (event) => { if (event.key === 'Escape') setActiveProduct(null) }
    window.addEventListener('keydown', closeLightboxOnEscape)
    return () => window.removeEventListener('keydown', closeLightboxOnEscape)
  }, [])

  function addToCart(productId) {
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === productId)
      return existingItem ? currentCart.map((item) => item.id === productId ? { ...item, quantity: item.quantity + 1 } : item) : [...currentCart, { id: productId, quantity: 1 }]
    })
  }

  function updateQuantity(productId, change) {
    setCart((currentCart) => currentCart.flatMap((item) => {
      if (item.id !== productId) return [item]
      const quantity = item.quantity + change
      return quantity > 0 ? [{ ...item, quantity }] : []
    }))
  }

  async function handleOrderSubmit(event) {
    event.preventDefault()
    setSubmissionError('')
    setIsSubmitting(true)
    const form = event.currentTarget
    const formData = new FormData(form)
    try {
      const response = await submitOrderEnquiry({
        customer: {
          fullName: formData.get('fullName'),
          company: formData.get('company'),
          email: formData.get('email'),
          phone: formData.get('phone'),
        },
        location: formData.get('location'),
        notes: formData.get('notes'),
        items: cartItems.map(({ product, quantity }) => ({ productId: product.id, quantity })),
      })
      setOrderReference(response.reference)
      setCart([])
      form.reset()
    } catch (error) {
      setSubmissionError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function showCart() { document.getElementById('shop-cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  function selectPage(page) {
    setCurrentPage(page)
    document.getElementById('catalogue-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <div className="shop-shell">
    <a className="skip-link" href="#shop-main">Skip to store content</a>
    <ShopHeader mode={mode} itemCount={itemCount} onGoHome={goHome} onGoToCatalogue={goToCatalogue} onShowCart={showCart} />
    <main id="shop-main">
      {mode === 'catalogue' && <>
        <section className="shop-hero"><div><p className="eyebrow"><span /> GPEC product catalogue</p><h1>Source what<br /><em>your work needs.</em></h1></div><p>Browse selected electrical, solar, and industrial products. Add items to your order enquiry and GPEC will confirm availability and final pricing.</p></section>
        <section className="shop-layout" aria-label="Product catalogue and cart"><div id="catalogue-products"><div className="shop-section-heading"><p className="eyebrow"><span /> Available products</p><p>Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}–{Math.min(currentPage * PRODUCTS_PER_PAGE, catalogueProducts.length)} of {catalogueProducts.length} products</p></div><div className="shop-product-grid">{pageProducts.map((product) => <ProductCard key={product.id} product={product} onOpen={setActiveProduct} onAdd={addToCart} />)}</div><nav className="shop-pagination" aria-label="Product catalogue pages"><button type="button" onClick={() => selectPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button>{Array.from({ length: totalPages }, (_, index) => { const page = index + 1; return <button type="button" key={page} className={page === currentPage ? 'is-active' : ''} aria-current={page === currentPage ? 'page' : undefined} onClick={() => selectPage(page)}>{page}</button> })}<button type="button" onClick={() => selectPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button></nav></div><Cart cartItems={cartItems} itemCount={itemCount} onUpdateQuantity={updateQuantity} onRemove={(productId) => setCart((currentCart) => currentCart.filter((item) => item.id !== productId))} onGoToOrder={goToOrder} /></section>
      </>}
      {mode === 'order' && <section className="shop-order-page"><OrderForm cartItems={cartItems} itemCount={itemCount} orderReference={orderReference} isSubmitting={isSubmitting} submissionError={submissionError} onSubmit={handleOrderSubmit} onGoToCatalogue={goToCatalogue} /></section>}
    </main>
    <ProductModal product={activeProduct} onClose={() => setActiveProduct(null)} />
  </div>
}
