import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Order matters: later files may override earlier ones. admin.css loads with the admin screens
// (pages/AdminPage.tsx), after these.
import './styles/base.css'
import './styles/site.css'
import './styles/home.css'
import './styles/shop.css'
import './styles/privacy.css'

// Paystack sends customers back to /shop/payment-complete?trxref=…&reference=… (the address the server
// gives it; a #hash address would not survive Paystack adding its query). Turn that into the site's
// own #shop/payment/<reference> route, without the query, before anything renders.
if (window.location.pathname === '/shop/payment-complete') {
  const reference = new URLSearchParams(window.location.search).get('reference') ?? ''
  window.history.replaceState(null, '', /^[0-9a-f]{24}$/.test(reference) ? `/#shop/payment/${reference}` : '/#shop')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
