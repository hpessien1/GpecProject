import { Suspense, lazy, useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import PrivacyPage from './pages/PrivacyPage'
import StorePage from './pages/StorePage'

// Loaded only when someone opens #admin, so customers never download the admin screens.
const AdminPage = lazy(() => import('./pages/AdminPage'))

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash)

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  // #shop/payment/<reference>: back from Paystack (see main.tsx).
  const payment = /^#shop\/payment\/([0-9a-f]{24})$/.exec(route)
  const isShopRoute = route === '#shop' || route === '#shop/order' || payment !== null
  const shopMode = payment ? 'payment' : route === '#shop/order' ? 'order' : 'catalogue'
  const goHome = () => { window.location.hash = '#home' }
  const goToCatalogue = () => { window.location.hash = '#shop' }
  const goToOrder = () => { window.location.hash = '#shop/order' }

  if (route === '#admin' || route.startsWith('#admin/')) {
    return <Suspense fallback={<p className="admin-loading" role="status">Loading…</p>}><AdminPage route={route} /></Suspense>
  }

  if (route === '#privacy') return <PrivacyPage />

  return isShopRoute
    ? <StorePage mode={shopMode} paymentReference={payment?.[1] ?? null} goHome={goHome} goToCatalogue={goToCatalogue} goToOrder={goToOrder} />
    : <LandingPage />
}
