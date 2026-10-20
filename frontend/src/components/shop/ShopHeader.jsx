export default function ShopHeader({ mode, itemCount, onGoHome, onGoToCatalogue, onShowCart }) {
  return <header className="shop-topbar">
    <a className="shop-brand" href="#home" onClick={onGoHome} aria-label="Return to GPEC home"><span>GPEC</span><small>Product ordering</small></a>
    <nav className="shop-navigation" aria-label="Store navigation">
      <a href="#home" onClick={onGoHome}>Return to site</a>
      {mode === 'order' && <button type="button" className="shop-link-button" onClick={onGoToCatalogue}>Continue browsing</button>}
      <button type="button" className="shop-cart-trigger" onClick={onShowCart}>Cart <span>{itemCount}</span></button>
    </nav>
  </header>
}
