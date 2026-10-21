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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
