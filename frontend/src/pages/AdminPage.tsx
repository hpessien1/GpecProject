import { useCallback, useEffect, useState } from 'react'
// Only the admin screens use these styles, so they load with this page (lazy-loaded in App.tsx).
import '../styles/admin.css'
import AdminBankTransfer from '../components/admin/AdminBankTransfer'
import AdminDeliveryAreaEditor from '../components/admin/AdminDeliveryAreaEditor'
import AdminDeliveryAreas from '../components/admin/AdminDeliveryAreas'
import AdminForgotPassword from '../components/admin/AdminForgotPassword'
import AdminHeader from '../components/admin/AdminHeader'
import AdminLogin from '../components/admin/AdminLogin'
import AdminOrderDetail from '../components/admin/AdminOrderDetail'
import AdminOrders from '../components/admin/AdminOrders'
import AdminPasswordForm from '../components/admin/AdminPasswordForm'
import AdminProductEditor from '../components/admin/AdminProductEditor'
import AdminProductList from '../components/admin/AdminProductList'
import AdminRequestDetail from '../components/admin/AdminRequestDetail'
import AdminRequestList from '../components/admin/AdminRequestList'
import AdminResetPassword from '../components/admin/AdminResetPassword'
import AdminSectionNav from '../components/admin/AdminSectionNav'
import { ApiError } from '../services/apiClient'
import { getAdminSession, logOut } from '../services/adminApi'
import { forgetRememberedState } from '../utils/rememberedState'
import type { AdminRequestKind, AdminSessionInfo } from '../types'

interface AdminPageProps {
  // #admin, #admin/new, #admin/products/<id>, #admin/password, #admin/orders[/<reference>],
  // #admin/delivery[/<id>], #admin/bank-transfer,
  // #admin/contact-requests[/<reference>], or (without logging in) #admin/forgot-password and
  // #admin/reset-password/<token>
  route: string
}

type AdminView =
  | { kind: 'forgot' }
  | { kind: 'reset', token: string }
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit', productId: string }
  | { kind: 'password' }
  | { kind: 'orders' }
  | { kind: 'order', reference: string }
  | { kind: 'delivery' }
  | { kind: 'bankTransfer' }
  | { kind: 'deliveryArea', areaId: string }
  | { kind: 'requests', requestKind: AdminRequestKind }
  | { kind: 'request', requestKind: AdminRequestKind, reference: string }

function parseView(route: string): AdminView {
  if (route === '#admin/forgot-password') return { kind: 'forgot' }
  const reset = /^#admin\/reset-password(?:\/([^/]*))?$/.exec(route)
  if (reset) return { kind: 'reset', token: reset[1] ?? '' }
  if (route === '#admin/new') return { kind: 'new' }
  if (route === '#admin/password') return { kind: 'password' }
  if (route === '#admin/orders') return { kind: 'orders' }
  const order = /^#admin\/orders\/([^/]+)$/.exec(route)
  if (order) return { kind: 'order', reference: decodeURIComponent(order[1]) }
  if (route === '#admin/delivery') return { kind: 'delivery' }
  if (route === '#admin/bank-transfer') return { kind: 'bankTransfer' }
  const deliveryArea = /^#admin\/delivery\/([^/]+)$/.exec(route)
  if (deliveryArea) return { kind: 'deliveryArea', areaId: decodeURIComponent(deliveryArea[1]) }
  const product = /^#admin\/products\/([^/]+)$/.exec(route)
  if (product) return { kind: 'edit', productId: decodeURIComponent(product[1]) }
  const request = /^#admin\/contact-requests(?:\/([^/]+))?$/.exec(route)
  if (request) {
    const requestKind = 'contact-requests'
    return request[1] ? { kind: 'request', requestKind, reference: decodeURIComponent(request[1]) } : { kind: 'requests', requestKind }
  }
  return { kind: 'list' }
}

function sectionOf(view: AdminView) {
  if (view.kind === 'requests' || view.kind === 'request') return view.requestKind
  if (view.kind === 'orders' || view.kind === 'order') return 'orders'
  if (view.kind === 'delivery' || view.kind === 'deliveryArea') return 'delivery'
  if (view.kind === 'bankTransfer') return 'bank-transfer'
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

  // Each login starts the lists at their first page, whoever logged in before.
  function handleLoggedIn(newSession: AdminSessionInfo) {
    forgetRememberedState()
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

  // A reset logs the admin out everywhere, this browser included.
  function handlePasswordReset() {
    setSession(null)
    setNotice('Your new password is saved. Log in with it.')
    window.location.hash = '#admin'
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
      {view.kind === 'forgot' ? <AdminForgotPassword />
        : view.kind === 'reset' ? <AdminResetPassword token={view.token} onPasswordReset={handlePasswordReset} />
        : isCheckingSession ? <p className="admin-loading" role="status">Checking your login…</p>
        : !session ? <AdminLogin notice={notice} onLoggedIn={handleLoggedIn} />
        : <>
        <AdminSectionNav current={sectionOf(view)} />
        {view.kind === 'list' ? <AdminProductList currency={session.currency} onSessionEnded={handleSessionEnded} />
        : view.kind === 'password' ? <AdminPasswordForm onSessionEnded={handleSessionEnded} />
        : view.kind === 'orders' ? <AdminOrders onSessionEnded={handleSessionEnded} />
        : view.kind === 'order' ? <AdminOrderDetail key={route} reference={view.reference} onSessionEnded={handleSessionEnded} />
        : view.kind === 'bankTransfer' ? <AdminBankTransfer currency={session.currency} onSessionEnded={handleSessionEnded} />
        : view.kind === 'delivery' ? <AdminDeliveryAreas currency={session.currency} onSessionEnded={handleSessionEnded} />
        : view.kind === 'deliveryArea' ? <AdminDeliveryAreaEditor key={route} areaId={view.areaId} currency={session.currency} onSessionEnded={handleSessionEnded} />
        : view.kind === 'requests' ? <AdminRequestList key={view.requestKind} kind={view.requestKind} onSessionEnded={handleSessionEnded} />
        : view.kind === 'request' ? <AdminRequestDetail key={route} kind={view.requestKind} reference={view.reference} onSessionEnded={handleSessionEnded} />
        : <AdminProductEditor key={route} productId={view.kind === 'edit' ? view.productId : undefined} currency={session.currency} imageUploads={session.imageUploads} flash={flashMessage} onCreated={handleCreated} onSessionEnded={handleSessionEnded} />}
        </>}
    </main>
  </div>
}
