import { useEffect, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import LogoLockup from '../LogoLockup'

interface AdminHeaderProps {
  adminName: string | null
  isLoggingOut: boolean
  onLogOut: () => void
}

export default function AdminHeader({ adminName, isLoggingOut, onLogOut }: AdminHeaderProps) {
  // At 1100px and below the links sit behind the Menu button (admin.css), as on the public site.
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // The open menu covers the page below the header, so the page stays still behind it, and Escape
  // closes it with focus back on the Menu button (the same as components/Header.tsx).
  useEffect(() => {
    if (!menuOpen) return
    document.documentElement.classList.add('menu-open')
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.documentElement.classList.remove('menu-open')
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  // Tabbing past the last item would otherwise focus links hidden behind the menu.
  function closeWhenFocusLeaves(event: FocusEvent<HTMLElement>) {
    if (menuOpen && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false)
  }

  // Choosing any item closes the menu, including a link to the screen already open.
  const closeMenu = () => setMenuOpen(false)

  return <header className="shop-topbar admin-topbar" onBlur={closeWhenFocusLeaves}>
    <a className="shop-brand" href="#admin" aria-label="GPEC admin home" onClick={closeMenu}><LogoLockup /><small>Admin</small></a>
    {adminName && <>
      <button ref={toggleRef} className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen((open) => !open)}><span>{menuOpen ? 'Close' : 'Menu'}</span><i aria-hidden="true" /></button>
      <nav id="admin-navigation" className={menuOpen ? 'shop-navigation is-open' : 'shop-navigation'} aria-label="Admin navigation">
        <a href="#shop" onClick={closeMenu}>View shop</a>
        <a href="#admin/password" onClick={closeMenu}>Change password</a>
        <a href="#admin/security" onClick={closeMenu}>Two-step login</a>
        <button type="button" className="shop-link-button" onClick={() => { closeMenu(); onLogOut() }} disabled={isLoggingOut}>{isLoggingOut ? 'Logging out…' : 'Log out'}</button>
        {/* Which account is logged in (two people use the admin side): a label, not a link. At the end
            of the row, and at the top of the open menu. */}
        <p className="admin-user"><small>Logged in as</small> {adminName}</p>
      </nav>
    </>}
  </header>
}
