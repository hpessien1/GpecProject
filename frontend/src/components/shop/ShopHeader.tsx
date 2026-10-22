import LogoLockup from '../LogoLockup'
import type { StoreMode } from '../../types'

interface ShopHeaderProps {
  mode: StoreMode
  itemCount: number
  onGoHome: () => void
  onGoToCatalogue: () => void
  onShowCart: () => void
}

export default function ShopHeader({ mode, itemCount, onGoHome, onGoToCatalogue, onShowCart }: ShopHeaderProps) {
  return <header className="shop-topbar">
    {/* The logo goes home, as on every page; the label only says where you are, so it is not part of the link. */}
    <div className="shop-brand"><a href="#home" onClick={onGoHome} aria-label="Return to GPEC home"><LogoLockup /></a><small>Product ordering</small></div>
    <nav className="shop-navigation" aria-label="Store navigation">
      <a href="#home" onClick={onGoHome}>Return to site</a>
      {mode === 'order' && <button type="button" className="shop-link-button" onClick={onGoToCatalogue}>Continue browsing</button>}
      <button type="button" className="shop-cart-trigger" onClick={onShowCart}>Cart <span>{itemCount}</span></button>
    </nav>
  </header>
}
