import { navigationLinks } from '../data/landingContent'

// Worked out once when the page loads, not on every render.
const currentYear = new Date().getFullYear()

export default function Footer() {
  return <footer className="footer"><nav className="footer-links" aria-label="Footer navigation">{navigationLinks.filter(([href]) => href !== '#home').map(([href, label]) => <a key={href} href={href}>{label}</a>)}<a href="#shop">Shop</a><a href="#privacy">Privacy notice</a></nav><div className="footer-note"><span>© {currentYear} GPEC</span><span>Company contact details to be added</span></div></footer>
}
