import LogoLockup from '../LogoLockup'

interface AdminHeaderProps {
  adminName: string | null
  isLoggingOut: boolean
  onLogOut: () => void
}

export default function AdminHeader({ adminName, isLoggingOut, onLogOut }: AdminHeaderProps) {
  return <header className="shop-topbar admin-topbar">
    <a className="shop-brand" href="#admin" aria-label="GPEC admin home"><LogoLockup /><small>Admin</small></a>
    {adminName && <nav className="shop-navigation" aria-label="Admin navigation">
      <a href="#shop">View shop</a>
      <a className="admin-account-link" href="#admin/password">Change password</a>
      <a className="admin-account-link" href="#admin/security">Two-step login</a>
      <button type="button" className="shop-link-button" onClick={onLogOut} disabled={isLoggingOut}>{isLoggingOut ? 'Logging out…' : 'Log out'}</button>
      {/* Which account is logged in (two people use the admin side): a label at the end, not a link. */}
      <p className="admin-user"><small>Logged in as</small> {adminName}</p>
    </nav>}
  </header>
}
