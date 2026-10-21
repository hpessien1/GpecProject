interface AdminHeaderProps {
  adminName: string | null
  isLoggingOut: boolean
  onLogOut: () => void
}

export default function AdminHeader({ adminName, isLoggingOut, onLogOut }: AdminHeaderProps) {
  return <header className="shop-topbar admin-topbar">
    <a className="shop-brand" href="#admin"><span>GPEC</span><small>Admin</small></a>
    {adminName && <nav className="shop-navigation" aria-label="Admin navigation">
      <a href="#admin">Products</a>
      <a href="#shop">View shop</a>
      <span className="admin-user">{adminName}</span>
      <a className="admin-account-link" href="#admin/password">Change password</a>
      <button type="button" className="shop-link-button" onClick={onLogOut} disabled={isLoggingOut}>{isLoggingOut ? 'Logging out…' : 'Log out'}</button>
    </nav>}
  </header>
}
