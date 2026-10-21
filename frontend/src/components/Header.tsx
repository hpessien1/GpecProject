import Arrow from './Arrow'
import LogoLockup from './LogoLockup'
import { navigationLinks } from '../data/landingContent'

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
      {navigationLinks.map(([href, label]) => <a key={href} href={href} onClick={onCloseMenu}>{label}</a>)}
      <a className="nav-cta" href="#shop" onClick={onCloseMenu}>Shop <Arrow /></a>
    </nav>
  </header>
}
