import { useEffect, useState } from 'react'
import Footer from '../components/Footer'
import Header from '../components/Header'
import PlaceholderText from '../components/PlaceholderText'
import { privacyIntro, privacyLastUpdated, privacySections, privacyStatus } from '../data/privacyContent'

export default function PrivacyPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Privacy notice | GPEC'
    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => { document.title = previousTitle }
  }, [])

  return <div className="site-shell">
    {/* Moves focus without changing the hash: "#main" would be read as a route and leave this page. */}
    <a className="skip-link" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
    <Header menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} onCloseMenu={() => setMenuOpen(false)} />
    <main id="main" className="privacy-page" tabIndex={-1}>
      <section className="privacy-hero">
        <p className="eyebrow"><span /> Your information</p>
        <h1>Privacy notice</h1>
        <p>{privacyIntro}</p>
      </section>
      <div className="privacy-body">
        <p className="privacy-status" role="note">{privacyStatus}</p>
        <p className="privacy-updated">Last updated: <PlaceholderText text={privacyLastUpdated} /></p>
        {privacySections.map((section) => <section key={section.title} className="privacy-section">
          <h2>{section.title}</h2>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}><PlaceholderText text={paragraph} /></p>)}
          {section.list && <ul>{section.list.map((item) => <li key={item}><PlaceholderText text={item} /></li>)}</ul>}
        </section>)}
      </div>
    </main>
    <Footer />
  </div>
}
