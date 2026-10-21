import { useCallback, useEffect, useState } from 'react'
import AdminHeader from '../components/admin/AdminHeader'
import AdminLogin from '../components/admin/AdminLogin'
import AdminPasswordForm from '../components/admin/AdminPasswordForm'
import AdminProductEditor from '../components/admin/AdminProductEditor'
import AdminProductList from '../components/admin/AdminProductList'
import AdminRequestDetail from '../components/admin/AdminRequestDetail'
import AdminRequestList from '../components/admin/AdminRequestList'
import AdminSectionNav from '../components/admin/AdminSectionNav'
import { ApiError } from '../services/apiClient'
import { getAdminSession, logOut } from '../services/adminApi'
import type { AdminRequestKind, AdminSessionInfo } from '../types'

interface AdminPageProps {
  // #admin, #admin/new, #admin/products/<id>, #admin/password,
  // #admin/enquiries[/<reference>], or #admin/contact-requests[/<reference>]
  route: string
}

type AdminView =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit', productId: string }
  | { kind: 'password' }
  | { kind: 'requests', requestKind: AdminRequestKind }
  | { kind: 'request', requestKind: AdminRequestKind, reference: string }

function parseView(route: string): AdminView {
  if (route === '#admin/new') return { kind: 'new' }
  if (route === '#admin/password') return { kind: 'password' }
  const product = /^#admin\/products\/([^/]+)$/.exec(route)
  if (product) return { kind: 'edit', productId: decodeURIComponent(product[1]) }
  const request = /^#admin\/(enquiries|contact-requests)(?:\/([^/]+))?$/.exec(route)
  if (request) {
    const requestKind = request[1] === 'enquiries' ? 'enquiries' : 'contact-requests'
    return request[2] ? { kind: 'request', requestKind, reference: decodeURIComponent(request[2]) } : { kind: 'requests', requestKind }
  }
  return { kind: 'list' }
}

function sectionOf(view: AdminView) {
  if (view.kind === 'requests' || view.kind === 'request') return view.requestKind
  return view.kind === 'password' ? null : 'products'
}

// Staff-only area. The browser only shows these screens; every admin request is checked by the server.
export default function AdminPage({ route }: AdminPageProps) {
  const [session, setSession] = useState<AdminSessionInfo | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [notice, setNotice] = useState('')
  const [flash, setFlash] = useState({ route: '', message: '' })
  const view = parseView(route)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Admin | GPEC'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    getAdminSession()
      .then(setSession)
      .catch((error: unknown) => { if (!(error instanceof ApiError && error.status === 401)) setNotice(error instanceof Error ? error.message : 'Unable to check your login.') })
      .finally(() => setIsCheckingSession(false))
  }, [])

  // Move focus to the new screen's heading, as a full page load would.
  useEffect(() => { if (!isCheckingSession) document.querySelector<HTMLElement>('#admin-main h1')?.focus() }, [route, session, isCheckingSession])

  // Stable, because child screens list it in their effect dependencies.
  const handleSessionEnded = useCallback(() => {
    setSession(null)
    setNotice('Your session has ended. Please log in again.')
  }, [])

  function handleLoggedIn(newSession: AdminSessionInfo) {
    setNotice('')
    setSession(newSession)
  }

  async function handleLogOut() {
    setIsLoggingOut(true)
    try {
      await logOut()
      setSession(null)
      setNotice('You have logged out.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to log out. Please try again.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  function handleCreated(productId: string) {
    const productRoute = `#admin/products/${encodeURIComponent(productId)}`
    setFlash({ route: productRoute, message: 'Product created.' })
    window.location.hash = productRoute
  }

  const flashMessage = flash.route === route ? flash.message : ''
  return <div className="admin-shell">
    <a className="skip-link" href="#admin-main" onClick={(event) => { event.preventDefault(); document.getElementById('admin-main')?.focus() }}>Skip to admin content</a>
    <AdminHeader adminName={session?.admin.name ?? null} isLoggingOut={isLoggingOut} onLogOut={handleLogOut} />
    <main id="admin-main" className="admin-main" tabIndex={-1}>
      {isCheckingSession ? <p className="admin-loading" role="status">Checking your login…</p>
        : !session ? <AdminLogin notice={notice} onLoggedIn={handleLoggedIn} />
        : <>
        <AdminSectionNav current={sectionOf(view)} />
        {view.kind === 'list' ? <AdminProductList currency={session.currency} onSessionEnded={handleSessionEnded} />
        : view.kind === 'password' ? <AdminPasswordForm onSessionEnded={handleSessionEnded} />
        : view.kind === 'requests' ? <AdminRequestList key={view.requestKind} kind={view.requestKind} onSessionEnded={handleSessionEnded} />
        : view.kind === 'request' ? <AdminRequestDetail key={route} kind={view.requestKind} reference={view.reference} onSessionEnded={handleSessionEnded} />
        : <AdminProductEditor key={route} productId={view.kind === 'edit' ? view.productId : undefined} currency={session.currency} flash={flashMessage} onCreated={handleCreated} onSessionEnded={handleSessionEnded} />}
        </>}
    </main>
  </div>
}
