import { useEffect, useState } from 'react'
import LandingPage from './pages/LandingPage'
import StorePage from './pages/StorePage'

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash)

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  const isShopRoute = route === '#shop' || route === '#shop/order'
  const shopMode = route === '#shop/order' ? 'order' : 'catalogue'
  const goHome = () => { window.location.hash = '#home' }
  const goToCatalogue = () => { window.location.hash = '#shop' }
  const goToOrder = () => { window.location.hash = '#shop/order' }

  return isShopRoute
    ? <StorePage mode={shopMode} goHome={goHome} goToCatalogue={goToCatalogue} goToOrder={goToOrder} />
    : <LandingPage />
}
