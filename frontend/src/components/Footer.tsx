import { companyContact, navigationLinks } from '../data/landingContent'

// Worked out once when the page loads, not on every render.
const currentYear = new Date().getFullYear()

export default function Footer() {
  return <footer className="footer"><nav className="footer-links" aria-label="Footer navigation">{navigationLinks.filter(([href]) => href !== '#home').map(([href, label]) => <a key={href} href={href}>{label}</a>)}<a href="#shop">Shop</a><a href="#faq">FAQ</a><a href="#refunds">Refunds &amp; returns</a><a href="#privacy">Privacy notice</a></nav><div className="footer-note"><span>© {currentYear} {companyContact.legalName}</span><address className="footer-contact"><a href={`mailto:${companyContact.email}`}>{companyContact.email}</a>{companyContact.phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>)}<span>{companyContact.address}</span></address></div></footer>
}
