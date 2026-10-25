import { useEffect, useRef } from 'react'
import type { FocusEvent } from 'react'
import Arrow from './Arrow'
import LogoLockup from './LogoLockup'
import { navigationLinks } from '../data/landingContent'

interface HeaderProps {
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
}

export default function Header({ menuOpen, onToggleMenu, onCloseMenu }: HeaderProps) {
  const toggleRef = useRef<HTMLButtonElement>(null)

  // The open menu covers the page below the header (site.css), so the page stays still behind it,
  // and Escape closes it with focus back on the Menu button.
  useEffect(() => {
    if (!menuOpen) return
    document.documentElement.classList.add('menu-open')
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onCloseMenu()
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.documentElement.classList.remove('menu-open')
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen, onCloseMenu])

  // Tabbing past the last item would otherwise focus links hidden behind the menu.
  function closeWhenFocusLeaves(event: FocusEvent<HTMLElement>) {
    if (menuOpen && !event.currentTarget.contains(event.relatedTarget)) onCloseMenu()
  }

  return <header className="topbar" onBlur={closeWhenFocusLeaves}>
    <a className="brand" href="#home" onClick={onCloseMenu} aria-label="GPEC home"><LogoLockup /></a>
    <button ref={toggleRef} className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={onToggleMenu}><span>{menuOpen ? 'Close' : 'Menu'}</span><i aria-hidden="true" /></button>
    <nav id="main-navigation" className={menuOpen ? 'navigation is-open' : 'navigation'} aria-label="Main navigation">
      {navigationLinks.map(([href, label]) => <a key={href} href={href} onClick={onCloseMenu}>{label}</a>)}
      <a className="nav-cta" href="#shop" onClick={onCloseMenu}>Shop <Arrow /></a>
    </nav>
  </header>
}
