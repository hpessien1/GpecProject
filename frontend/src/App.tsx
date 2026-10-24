import { Suspense, lazy, useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import PolicyPage from './pages/PolicyPage'
import StorePage from './pages/StorePage'
import { productGroups } from './data/landingContent'

// Loaded only when someone opens #admin, so customers never download the admin screens.
const AdminPage = lazy(() => import('./pages/AdminPage'))

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash)

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  // #shop/payment/<reference>: back from Paystack (see main.tsx). #shop/category/<category>: the
  // catalogue showing one product group (the home page's Products cards link there).
  const payment = /^#shop\/payment\/([0-9a-f]{24})$/.exec(route)
  const categoryRoute = /^#shop\/category\/([a-z]+)$/.exec(route)
  const category = productGroups.find((group) => group.category === categoryRoute?.[1])?.category ?? null
  const isShopRoute = route === '#shop' || route === '#shop/order' || payment !== null || category !== null
  const shopMode = payment ? 'payment' : route === '#shop/order' ? 'order' : 'catalogue'
  const goHome = () => { window.location.hash = '#home' }
  const goToCatalogue = () => { window.location.hash = '#shop' }
  const goToOrder = () => { window.location.hash = '#shop/order' }

  if (route === '#admin' || route.startsWith('#admin/')) {
    return <Suspense fallback={<p className="admin-loading" role="status">Loading…</p>}><AdminPage route={route} /></Suspense>
  }

  if (route === '#privacy' || route === '#refunds') return <PolicyPage key={route} pageKey={route === '#privacy' ? 'privacy' : 'refunds'} />

  return isShopRoute
    ? <StorePage mode={shopMode} category={category} paymentReference={payment?.[1] ?? null} goHome={goHome} goToCatalogue={goToCatalogue} goToOrder={goToOrder} />
    : <LandingPage />
}
