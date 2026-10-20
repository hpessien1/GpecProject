import Arrow from './Arrow'
import LogoLockup from './LogoLockup'

interface HeaderProps {
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
}

export default function Header({ menuOpen, onToggleMenu, onCloseMenu }: HeaderProps) {
  return <header className="topbar">
    <a className="brand" href="#home" onClick={onCloseMenu} aria-label="GPEC home"><LogoLockup /></a>
    <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={onToggleMenu}><span>{menuOpen ? 'Close' : 'Menu'}</span><i aria-hidden="true" /></button>
    <nav id="main-navigation" className={menuOpen ? 'navigation is-open' : 'navigation'} aria-label="Main navigation">
      <a href="#about" onClick={onCloseMenu}>About</a><a href="#services" onClick={onCloseMenu}>Services</a><a href="#products" onClick={onCloseMenu}>Products</a><a href="#shop" onClick={onCloseMenu}>Shop</a><a href="#work" onClick={onCloseMenu}>Work</a><a href="#work" onClick={onCloseMenu}>Portfolio</a>
      <a className="nav-cta" href="#contact" onClick={onCloseMenu}>Request a quote <Arrow /></a>
    </nav>
  </header>
}
